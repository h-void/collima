//! `collima-core`: WebAssembly & native Rust optical collimation and sensor read-noise workbench.
//!
//! Exports both:
//! 1. Stateful `RawSession` for zero-redecode interactive 9-grid 1:1 loupe panning, EV boost,
//!    and custom ROI sharpness re-evaluation inside a Web Worker;
//! 2. Stateless `analyze_raw` and batch-optimized `analyze_dark_frame` / `analyze_iso_series_json`
//!    functions, plus built-in synthetic 14-bit `.DNG` calibration generators.

pub mod bayer;
pub mod decoder;
pub mod noise;
pub mod sharpness;
pub mod synthetic;

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

use crate::bayer::{ImageBufferDesc, PatchRenderMode, render_overview_rgba, render_patch_rgba};
use crate::decoder::{DecodedRawImage, RawImageMetadata, decode_raw_bytes};
use crate::noise::{DarkFrameReport, analyze_iso_series, analyze_noise};
use crate::sharpness::{
    GridCellMetrics, SharpnessReport, analyze_sharpness, evaluate_custom_roi,
    recompute_report_with_custom_3x3,
};

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = performance, js_name = now)]
    fn performance_now() -> f64;
}

/// Automatic WASM module initialization: installs `console_error_panic_hook` and registers
/// `performance.now()` for `flashraw`'s profiling clock (`std::time::Instant` does not exist on `wasm32`).
#[wasm_bindgen(start)]
pub fn init_wasm_hooks() {
    console_error_panic_hook::set_once();
    #[cfg(target_arch = "wasm32")]
    {
        flashraw::low_level::core::profile::set_clock(performance_now);
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FullAnalysisPayload {
    pub metadata: RawImageMetadata,
    pub sharpness: SharpnessReport,
    pub noise: DarkFrameReport,
    pub overview_desc: ImageBufferDesc,
}

fn to_js_err(e: impl std::fmt::Display) -> JsValue {
    js_sys::Error::new(&e.to_string()).into()
}

fn to_js_val<T: Serialize>(val: &T) -> Result<JsValue, JsValue> {
    let serializer = serde_wasm_bindgen::Serializer::json_compatible();
    val.serialize(&serializer).map_err(to_js_err)
}

/// Stateless one-shot RAW analysis entry point (`analyze_raw(bytes: &[u8]) -> Result<JsValue, JsValue>`).
/// Returns JSON-compatible structured metadata, 3x3/5x5 sharpness report, and 4-channel noise report.
#[wasm_bindgen]
pub fn analyze_raw(bytes: &[u8]) -> Result<JsValue, JsValue> {
    let decoded = decode_raw_bytes(bytes).map_err(to_js_err)?;
    let sharpness = analyze_sharpness(&decoded);
    let noise = analyze_noise(&decoded, "sample.raw");
    let overview = render_overview_rgba(&decoded, 1600, 0.0);
    let payload = FullAnalysisPayload {
        metadata: decoded.meta,
        sharpness,
        noise,
        overview_desc: overview.desc,
    };
    to_js_val(&payload)
}

/// Memory-lean dark-frame analyzer for Sensor Noise Lab batch queues.
/// Decodes one RAW file in memory, computes exact 65,536-bin 4-channel histograms & read noise,
/// and immediately drops the 60MP pixel buffer before returning.
#[wasm_bindgen]
pub fn analyze_dark_frame(bytes: &[u8], filename: &str) -> Result<JsValue, JsValue> {
    let decoded = decode_raw_bytes(bytes).map_err(to_js_err)?;
    let report = analyze_noise(&decoded, filename);
    to_js_val(&report)
}

/// Compute sorted ISO curve & automatic Dual Native ISO inflection points from a JSON array of `DarkFrameReport`s.
#[wasm_bindgen]
pub fn analyze_iso_series_json(frames_json: &str) -> Result<JsValue, JsValue> {
    let frames: Vec<DarkFrameReport> = serde_json::from_str(frames_json).map_err(to_js_err)?;
    let series = analyze_iso_series(frames);
    to_js_val(&series)
}

/// Stateful single-image session held inside the Web Worker for zero-latency interactive inspection.
#[wasm_bindgen]
pub struct RawSession {
    decoded: DecodedRawImage,
    sharpness: SharpnessReport,
    noise: DarkFrameReport,
    last_image_desc: ImageBufferDesc,
}

#[wasm_bindgen]
impl RawSession {
    /// Decode a RAW buffer once and initialize optical & noise reports.
    #[wasm_bindgen(constructor)]
    pub fn new(bytes: &[u8], filename: &str) -> Result<RawSession, JsValue> {
        let decoded = decode_raw_bytes(bytes).map_err(to_js_err)?;
        let sharpness = analyze_sharpness(&decoded);
        let noise = analyze_noise(&decoded, filename);
        Ok(RawSession {
            decoded,
            sharpness,
            noise,
            last_image_desc: ImageBufferDesc {
                width: 0,
                height: 0,
                sensor_x: 0,
                sensor_y: 0,
                sensor_px_per_out_px: 2.0,
            },
        })
    }

    /// Structured metadata, sharpness report, and noise report (no heavy byte arrays).
    #[wasm_bindgen(js_name = getSummary)]
    pub fn get_summary(&self) -> Result<JsValue, JsValue> {
        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct Summary<'a> {
            metadata: &'a RawImageMetadata,
            sharpness: &'a SharpnessReport,
            noise: &'a DarkFrameReport,
        }
        to_js_val(&Summary {
            metadata: &self.decoded.meta,
            sharpness: &self.sharpness,
            noise: &self.noise,
        })
    }

    /// Render the binned overview RGBA8 buffer (returned directly as `Vec<u8>` -> `Uint8Array`
    /// for zero-copy `Transferable` `ArrayBuffer` transfer to the main thread).
    #[wasm_bindgen(js_name = renderOverviewRgba)]
    pub fn render_overview_rgba(&mut self, max_dim: u32, ev_boost: f32) -> Vec<u8> {
        let rendered = render_overview_rgba(&self.decoded, max_dim, ev_boost);
        self.last_image_desc = rendered.desc;
        rendered.rgba
    }

    /// Render a 1:1 full-sensor-resolution patch centered at `(norm_x, norm_y) in [0, 1]^2`.
    /// `mode`: `0 = DemosaicSrgb`, `1 = GreenLuminance`, `2 = BayerMosaic`.
    #[wasm_bindgen(js_name = renderPatchRgba)]
    pub fn render_patch_rgba(
        &mut self,
        norm_x: f32,
        norm_y: f32,
        patch_w: u32,
        patch_h: u32,
        mode: u8,
        ev_boost: f32,
    ) -> Vec<u8> {
        let rendered = render_patch_rgba(
            &self.decoded,
            norm_x,
            norm_y,
            patch_w,
            patch_h,
            PatchRenderMode::from_u8(mode),
            ev_boost,
        );
        self.last_image_desc = rendered.desc;
        rendered.rgba
    }

    /// Dimensions and sensor coordinates of the most recently rendered overview or patch buffer.
    #[wasm_bindgen(js_name = lastImageDesc)]
    pub fn last_image_desc(&self) -> Result<JsValue, JsValue> {
        to_js_val(&self.last_image_desc)
    }

    /// Update one of the 9 stations (`station_idx in 0..9`) to a new dragged `(norm_x, norm_y)`
    /// center, re-evaluate its pre-demosaic Green Tenengrad & Star HFR, and recompute the
    /// global Tilt Vector & Corner Retention metrics.
    #[wasm_bindgen(js_name = relocateStation)]
    pub fn relocate_station(
        &mut self,
        station_idx: usize,
        norm_x: f32,
        norm_y: f32,
    ) -> Result<JsValue, JsValue> {
        if station_idx >= 9 {
            return Err(to_js_err("station_idx must be in 0..9"));
        }
        let existing: GridCellMetrics = self.sharpness.grid_3x3[station_idx].clone();
        let center_ref = if station_idx == 4 {
            1.0
        } else {
            self.sharpness.center_sharpness
        };
        let updated_cell = evaluate_custom_roi(
            &self.decoded,
            &existing.id,
            existing.row,
            existing.col,
            norm_x,
            norm_y,
            center_ref,
        );
        let mut new_3x3 = self.sharpness.grid_3x3.clone();
        new_3x3[station_idx] = updated_cell;
        let new_5x5 = self.sharpness.grid_5x5.clone();
        self.sharpness = recompute_report_with_custom_3x3(new_3x3, new_5x5);
        to_js_val(&self.sharpness)
    }

    /// Reset all 9 stations back to canonical `{0.10, 0.50, 0.90}` optical coordinates.
    #[wasm_bindgen(js_name = resetStations)]
    pub fn reset_stations(&mut self) -> Result<JsValue, JsValue> {
        self.sharpness = analyze_sharpness(&self.decoded);
        to_js_val(&self.sharpness)
    }
}

/// Generate an in-memory 14-bit `.DNG` optical tilt test chart (`Uint8Array` in JS).
#[wasm_bindgen(js_name = generateSyntheticTiltDng)]
pub fn generate_synthetic_tilt_dng(width: u32, height: u32, tilt_strength: f32) -> Vec<u8> {
    synthetic::generate_tilted_chart_dng(width, height, tilt_strength)
}

/// Generate an in-memory 14-bit `.DNG` astrophotography starfield with Top-Right tilt.
#[wasm_bindgen(js_name = generateSyntheticStarfieldDng)]
pub fn generate_synthetic_starfield_dng(width: u32, height: u32) -> Vec<u8> {
    synthetic::generate_starfield_tilt_dng(width, height)
}

/// Generate an in-memory 14-bit `.DNG` Dual-Native-ISO dark frame at the specified ISO.
#[wasm_bindgen(js_name = generateSyntheticDarkDng)]
pub fn generate_synthetic_dark_dng(width: u32, height: u32, iso: u32) -> Vec<u8> {
    synthetic::generate_dark_frame_dng(width, height, iso)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bayer::split_bayer_planes;
    use crate::decoder::MosaicKind;
    use crate::sharpness::OpticalGrade;

    #[test]
    fn test_in_memory_dng_decode_and_cfa_plane_split() {
        let dng = synthetic::generate_tilted_chart_dng(640, 480, 0.0);
        let decoded = decode_raw_bytes(&dng).expect("in-memory DNG should decode cleanly");

        assert_eq!(decoded.meta.active_width, 640);
        assert_eq!(decoded.meta.active_height, 480);
        assert_eq!(decoded.meta.iso, Some(100));
        assert_eq!(decoded.meta.mosaic_kind, MosaicKind::Bayer2x2);
        assert_eq!(decoded.meta.cfa_pattern, "RGGB");
        assert_eq!(decoded.black_levels, [512.0, 512.0, 512.0, 512.0]);
        assert_eq!(decoded.white_levels, [16383.0, 16383.0, 16383.0, 16383.0]);

        let planes = split_bayer_planes(&decoded).expect("Bayer2x2 should split into 4 planes");
        assert_eq!(planes.plane_width, 320);
        assert_eq!(planes.plane_height, 240);
        assert_eq!(planes.r.len(), 320 * 240);
        assert_eq!(planes.g1.len(), 320 * 240);
        assert_eq!(planes.g2.len(), 320 * 240);
        assert_eq!(planes.b.len(), 320 * 240);

        let overview = render_overview_rgba(&decoded, 1600, 0.0);
        assert_eq!(overview.desc.width, 320);
        assert_eq!(overview.desc.height, 240);
        assert_eq!(overview.rgba.len(), 320 * 240 * 4);

        let patch = render_patch_rgba(
            &decoded,
            0.5,
            0.5,
            128,
            128,
            PatchRenderMode::DemosaicSrgb,
            0.0,
        );
        assert_eq!(patch.desc.width, 128);
        assert_eq!(patch.desc.height, 128);
        assert_eq!(patch.rgba.len(), 128 * 128 * 4);
    }

    #[test]
    fn test_vignetting_invariance_and_tilt_detection() {
        // 1. Zero-tilt reference chart (has 1.4 EV corner vignetting + mild symmetric curvature):
        // Black-level-subtracted normalized Tenengrad must NOT confuse vignetting with mount tilt!
        let flat_dng = synthetic::generate_tilted_chart_dng(800, 600, 0.0);
        let flat_img = decode_raw_bytes(&flat_dng).unwrap();
        let flat_rep = analyze_sharpness(&flat_img);

        assert!(
            flat_rep.tilt_vector.magnitude < 0.08,
            "Flat collimated chart should have near-zero tilt magnitude, got {:.4}",
            flat_rep.tilt_vector.magnitude
        );
        assert!(
            flat_rep.asymmetry.max_diagonal_asymmetry < 0.10,
            "Flat collimated chart should have symmetric diagonals, got {:.4}",
            flat_rep.asymmetry.max_diagonal_asymmetry
        );
        assert!(
            matches!(
                flat_rep.grade,
                OpticalGrade::Excellent | OpticalGrade::NormalCurvature
            ),
            "Unexpected grade on flat chart: {:?}",
            flat_rep.grade
        );

        // 2. Heavily tilted chart (Top-Left collapses, Bottom-Right stays sharp):
        let tilt_dng = synthetic::generate_tilted_chart_dng(800, 600, 0.9);
        let tilt_img = decode_raw_bytes(&tilt_dng).unwrap();
        let tilt_rep = analyze_sharpness(&tilt_img);

        assert!(
            tilt_rep.corner_retention.br > tilt_rep.corner_retention.tl * 2.0,
            "Expected BR ({:.3}) >> TL ({:.3}) on TL-collapsed chart",
            tilt_rep.corner_retention.br,
            tilt_rep.corner_retention.tl
        );
        assert!(
            tilt_rep.tilt_vector.magnitude > 0.20,
            "Expected strong tilt vector > 0.20, got {:.3}",
            tilt_rep.tilt_vector.magnitude
        );
        assert_eq!(tilt_rep.grade, OpticalGrade::SevereTilt);
        assert!(
            tilt_rep
                .tilt_vector
                .collapse_direction_label
                .contains("Top-Left"),
            "Expected Top-Left collapse direction, got {}",
            tilt_rep.tilt_vector.collapse_direction_label
        );
    }

    #[test]
    fn test_starfield_hfr_and_tilt() {
        let astro_dng = synthetic::generate_starfield_tilt_dng(800, 600);
        let astro_img = decode_raw_bytes(&astro_dng).unwrap();
        let rep = analyze_sharpness(&astro_img);

        let tr_cell = &rep.grid_3x3[2]; // Top-Right (bloated stars)
        let bl_cell = &rep.grid_3x3[6]; // Bottom-Left (pinpoint stars)

        assert!(tr_cell.star_count >= 2 && bl_cell.star_count >= 2);
        let tr_hfr = tr_cell.median_star_hfr_px.expect("TR star HFR");
        let bl_hfr = bl_cell.median_star_hfr_px.expect("BL star HFR");
        assert!(
            tr_hfr > bl_hfr * 1.25,
            "Bloated TR star HFR ({:.2} px) should exceed sharp BL star HFR ({:.2} px)",
            tr_hfr,
            bl_hfr
        );
    }

    #[test]
    fn test_dark_frame_hot_pixel_rejection_and_dual_native_iso() {
        let isos = [100u32, 200, 400, 640, 800, 1600, 3200];
        let mut reports = Vec::new();

        for &iso in &isos {
            let dng = synthetic::generate_dark_frame_dng(400, 300, iso);
            let decoded = decode_raw_bytes(&dng).unwrap();
            let rep = analyze_noise(&decoded, &format!("dark_iso_{iso}.dng"));
            reports.push(rep);
        }

        // Verify hot pixels were cleanly stripped at ISO 100 (80 hot pixels injected up to 16383 ADU):
        let iso100 = &reports[0];
        assert!(
            iso100.total_hot_pixels >= 60 && iso100.total_hot_pixels <= 110,
            "Expected ~80 hot pixels rejected, got {}",
            iso100.total_hot_pixels
        );
        // Without hot-pixel rejection, 80 pixels at ~10000 ADU would blow sigma_ADU > 200 ADU!
        // With our 5-sigma histogram filter, ISO 100 sigma_ADU should match ground truth (~2.48 ADU):
        assert!(
            (iso100.mean_read_noise_adu - 2.5).abs() < 0.35,
            "ISO 100 read noise should be ~2.5 ADU after hot-pixel rejection, got {:.3}",
            iso100.mean_read_noise_adu
        );
        assert!(
            iso100.mean_engineering_dr_ev > 12.3 && iso100.mean_engineering_dr_ev < 13.0,
            "ISO 100 Engineering DR should be ~12.6 EV, got {:.2}",
            iso100.mean_engineering_dr_ev
        );

        // Verify Dual Native ISO inflection detection at ISO 640 -> ISO 800:
        let series = analyze_iso_series(reports);
        assert_eq!(
            series.inflections.len(),
            1,
            "Should detect exactly 1 HCG switch at ISO 800, got {:?}",
            series.inflections
        );
        assert_eq!(series.inflections[0].from_iso, 640);
        assert_eq!(series.inflections[0].to_iso, 800);
        assert!(series.inflections[0].raw_adu_dropped);
        assert!(series.inflections[0].norm_noise_drop_pct > 45.0);
    }

    #[test]
    fn test_corrupt_and_nikon_he_probe_safety() {
        assert!(decode_raw_bytes(&[]).is_err());
        assert!(decode_raw_bytes(b"NOT_A_RAW_FILE_HEADER_1234567890").is_err());
    }
}
