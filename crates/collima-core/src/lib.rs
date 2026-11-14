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
        if !norm_x.is_finite() || !norm_y.is_finite() {
            return Err(to_js_err("norm_x and norm_y must be finite numbers"));
        }
        let nx = norm_x.clamp(0.0, 1.0);
        let ny = norm_y.clamp(0.0, 1.0);
        let existing: GridCellMetrics = self.sharpness.grid_3x3[station_idx].clone();
        let center_ref = if station_idx == 4 {
            0.0
        } else {
            self.sharpness.center_sharpness
        };
        let updated_cell = evaluate_custom_roi(
            &self.decoded,
            &existing.id,
            existing.row,
            existing.col,
            nx,
            ny,
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

    /// Helper to patch an inline SHORT (`ty == 3`) or LONG (`ty == 4`) tag inside IFD0 (or ExifIFD) of a LE DNG.
    fn patch_le_tiff_tag_u32(buf: &mut [u8], target_tag: u16, new_val: u32) -> bool {
        if buf.len() < 8 || &buf[0..2] != b"II" {
            return false;
        }
        let ifd0 = u32::from_le_bytes(buf[4..8].try_into().unwrap()) as usize;
        fn scan_ifd(buf: &mut [u8], ifd_off: usize, target_tag: u16, new_val: u32) -> bool {
            if ifd_off + 2 > buf.len() {
                return false;
            }
            let count = u16::from_le_bytes(buf[ifd_off..ifd_off + 2].try_into().unwrap()) as usize;
            let mut exif_ptr = None;
            for i in 0..count {
                let e = ifd_off + 2 + i * 12;
                if e + 12 > buf.len() {
                    return false;
                }
                let tag = u16::from_le_bytes(buf[e..e + 2].try_into().unwrap());
                let ty = u16::from_le_bytes(buf[e + 2..e + 4].try_into().unwrap());
                if tag == target_tag {
                    if ty == 3 {
                        buf[e + 8..e + 10].copy_from_slice(&(new_val as u16).to_le_bytes());
                    } else {
                        buf[e + 8..e + 12].copy_from_slice(&new_val.to_le_bytes());
                    }
                    return true;
                }
                if tag == 0x8769 {
                    exif_ptr = Some(u32::from_le_bytes(buf[e + 8..e + 12].try_into().unwrap()) as usize);
                }
            }
            if let Some(ep) = exif_ptr {
                return scan_ifd(buf, ep, target_tag, new_val);
            }
            false
        }
        scan_ifd(buf, ifd0, target_tag, new_val)
    }

    #[test]
    fn test_tiff_probe_endianness_cycles_and_truncation() {
        use crate::decoder::is_nikon_he_nef;

        // 1. Little-endian (`II`) Nikon HE NEF (`Compression = 52546` inside SubIFD at odd unaligned offset 9)
        let mut le_he = vec![0u8; 64];
        le_he[0..2].copy_from_slice(b"II");
        le_he[2..4].copy_from_slice(&42u16.to_le_bytes());
        le_he[4..8].copy_from_slice(&9u32.to_le_bytes()); // unaligned IFD0 at byte 9
        // IFD0 at 9: 2 entries (`Make = "NIKON"`, `SubIFDs = 39`)
        le_he[9..11].copy_from_slice(&2u16.to_le_bytes());
        // Entry 0: Make (0x010F), ASCII (2), count 4, inline "NIK\0" -> wait, let's put 6 bytes at offset 57
        le_he[11..13].copy_from_slice(&0x010Fu16.to_le_bytes());
        le_he[13..15].copy_from_slice(&2u16.to_le_bytes());
        le_he[15..19].copy_from_slice(&6u32.to_le_bytes());
        le_he[19..23].copy_from_slice(&57u32.to_le_bytes());
        le_he[57..63].copy_from_slice(b"NIKON\0");
        // Entry 1: SubIFD (0x014A), LONG (4), count 1, inline offset 39
        le_he[23..25].copy_from_slice(&0x014Au16.to_le_bytes());
        le_he[25..27].copy_from_slice(&4u16.to_le_bytes());
        le_he[27..31].copy_from_slice(&1u32.to_le_bytes());
        le_he[31..35].copy_from_slice(&39u32.to_le_bytes());
        // next_ifd = 0 at 35..39
        // SubIFD at 39: 1 entry: Compression (0x0103), SHORT (3), count 1, value 52546 (TicoRAW HE)
        le_he[39..41].copy_from_slice(&1u16.to_le_bytes());
        le_he[41..43].copy_from_slice(&0x0103u16.to_le_bytes());
        le_he[43..45].copy_from_slice(&3u16.to_le_bytes());
        le_he[45..49].copy_from_slice(&1u32.to_le_bytes());
        le_he[49..51].copy_from_slice(&52546u16.to_le_bytes());
        assert!(is_nikon_he_nef(&le_he));

        // 2. Big-endian (`MM`) Nikon NEF (`Compression = 34713` in IFD0):
        //    - Without `FF 10 FF 50` strip magic -> Classic NEF (`is_nikon_he_nef == false`, routed to flashraw)
        //    - With `FF 10 FF 50` strip magic at StripOffsets (`0x0111`) -> Nikon HE NEF (`is_nikon_he_nef == true`)
        let mut be_he = vec![0u8; 80];
        be_he[0..2].copy_from_slice(b"MM");
        be_he[2..4].copy_from_slice(&42u16.to_be_bytes());
        be_he[4..8].copy_from_slice(&8u32.to_be_bytes());
        be_he[8..10].copy_from_slice(&3u16.to_be_bytes());
        // Entry 0: Compression (0x0103), SHORT (3), count 1, big-endian inline [34713, 0]
        be_he[10..12].copy_from_slice(&0x0103u16.to_be_bytes());
        be_he[12..14].copy_from_slice(&3u16.to_be_bytes());
        be_he[14..18].copy_from_slice(&1u32.to_be_bytes());
        be_he[18..20].copy_from_slice(&34713u16.to_be_bytes());
        // Entry 1: Make (0x010F), ASCII (2), count 6, offset 52
        be_he[22..24].copy_from_slice(&0x010Fu16.to_be_bytes());
        be_he[24..26].copy_from_slice(&2u16.to_be_bytes());
        be_he[26..30].copy_from_slice(&6u32.to_be_bytes());
        be_he[30..34].copy_from_slice(&52u32.to_be_bytes());
        be_he[52..58].copy_from_slice(b"NIKON\0");
        // Entry 2: StripOffsets (0x0111), LONG (4), count 1, offset 64
        be_he[34..36].copy_from_slice(&0x0111u16.to_be_bytes());
        be_he[36..38].copy_from_slice(&4u16.to_be_bytes());
        be_he[38..42].copy_from_slice(&1u32.to_be_bytes());
        be_he[42..46].copy_from_slice(&64u32.to_be_bytes());
        assert!(
            !is_nikon_he_nef(&be_he),
            "Classic Nikon Compression=34713 without TicoRAW magic must stay on FlashRaw path"
        );
        be_he[64..68].copy_from_slice(&[0xFF, 0x10, 0xFF, 0x50]);
        assert!(is_nikon_he_nef(&be_he));

        // 3. Malicious cyclic `next_ifd` (`IFD0 -> IFD0`) and cyclic `SubIFD` (`0x014A -> IFD0`)
        let mut cyclic = vec![0u8; 32];
        cyclic[0..2].copy_from_slice(b"II");
        cyclic[2..4].copy_from_slice(&42u16.to_le_bytes());
        cyclic[4..8].copy_from_slice(&8u32.to_le_bytes());
        cyclic[8..10].copy_from_slice(&1u16.to_le_bytes());
        cyclic[10..12].copy_from_slice(&0x014Au16.to_le_bytes());
        cyclic[12..14].copy_from_slice(&4u16.to_le_bytes());
        cyclic[14..18].copy_from_slice(&1u32.to_le_bytes());
        cyclic[18..22].copy_from_slice(&8u32.to_le_bytes()); // SubIFD points back to IFD0!
        cyclic[22..26].copy_from_slice(&8u32.to_le_bytes()); // next_ifd also points back to IFD0!
        assert!(!is_nikon_he_nef(&cyclic));
        assert!(decode_raw_bytes(&cyclic).is_err());

        // 4. Truncated IFD entry count (`65535` entries in a 16-byte buffer)
        let mut trunc = vec![0u8; 16];
        trunc[0..2].copy_from_slice(b"MM");
        trunc[2..4].copy_from_slice(&42u16.to_be_bytes());
        trunc[4..8].copy_from_slice(&8u32.to_be_bytes());
        trunc[8..10].copy_from_slice(&65535u16.to_be_bytes());
        assert!(!is_nikon_he_nef(&trunc));
        assert!(decode_raw_bytes(&trunc).is_err());
    }

    #[test]
    fn test_odd_active_area_and_odd_origin_bayer_alignment() {
        use crate::decoder::BayerQuadOffsets;

        // Full sensor is RGGB at (0,0), with optical black border of odd origin (ax=3, ay=5)
        // and odd active dimensions (aw=301, ah=203).
        // Shifting RGGB by (3, 5) == (1, 1) mod 2 turns the active-origin CFA into BGGR (`r=(1,1), b=(0,0)`)!
        let stride = 310usize;
        let buf_h = 212usize;
        let ax = 3usize;
        let ay = 5usize;
        let aw = 301usize;
        let ah = 203usize;

        let mut pixels = vec![512u16; stride * buf_h];
        for sy in 0..buf_h {
            for sx in 0..stride {
                // True sensor RGGB at (sx, sy): (0,0)=R=4000, (1,0)=G_rowR=8000, (0,1)=G_rowB=8200, (1,1)=B=2000
                pixels[sy * stride + sx] = match (sx & 1, sy & 1) {
                    (0, 0) => 4000,
                    (1, 0) => 8000,
                    (0, 1) => 8200,
                    _ => 2000,
                };
            }
        }

        let bo = BayerQuadOffsets::from_red_offset(ax & 1, ay & 1);
        assert_eq!(bo.pattern_string(), "BGGR");

        let img = DecodedRawImage {
            meta: RawImageMetadata {
                make: "Test".into(),
                model: "OddCrop".into(),
                camera_label: "Test OddCrop".into(),
                lens_make: None,
                lens_model: None,
                iso: Some(100),
                exposure_time_sec: Some(0.01),
                shutter_display: Some("1/100s".into()),
                f_number: Some(2.8),
                focal_length_mm: Some(50.0),
                capture_time: None,
                raw_width: stride as u32,
                raw_height: buf_h as u32,
                active_x: ax as u32,
                active_y: ay as u32,
                active_width: aw as u32,
                active_height: ah as u32,
                bits_per_sample: 14,
                cfa_pattern: bo.pattern_string(),
                mosaic_kind: MosaicKind::Bayer2x2,
                black_levels: [512.0; 4],
                white_levels: [16383.0; 4],
                wb_multipliers: [1.0, 1.0, 1.0],
                orientation_exif: 1,
                format_name: "DNG".into(),
                compression_name: "Uncompressed".into(),
                decoder_engine: "unit-test".into(),
                decode_ms: 0.1,
                warnings: vec![],
            },
            stride,
            buffer_height: buf_h,
            cpp: 1,
            pixels,
            active_rect: [ax, ay, aw, ah],
            bayer_offsets: Some(bo),
            generic_cfa: None,
            black_levels: [512.0; 4],
            white_levels: [16383.0; 4],
            wb_rgb: [1.0, 1.0, 1.0],
            cam_wb_to_srgb: [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]],
        };

        // Verify exact plane extraction without off-by-one into trailing odd row/col or border:
        let planes = split_bayer_planes(&img).unwrap();
        assert_eq!(planes.plane_width, 150);
        assert_eq!(planes.plane_height, 101);
        assert!(planes.r.iter().all(|&v| v == 4000));
        assert!(planes.g1.iter().all(|&v| v == 8000));
        assert!(planes.g2.iter().all(|&v| v == 8200));
        assert!(planes.b.iter().all(|&v| v == 2000));

        // Verify u32::MAX + NaN ev_boost safety in overview renderer:
        let ov = render_overview_rgba(&img, u32::MAX, f32::NAN);
        assert_eq!(ov.desc.width, 150);
        assert_eq!(ov.desc.height, 101);
        assert!(ov.rgba[0] > 50 && ov.rgba[1] > ov.rgba[0] && ov.rgba[0] > ov.rgba[2]);

        // Verify extreme edge patch (`norm_x = 0.0 / 1.0`, `patch_size > active_width`) parity-preserving demosaic:
        for &(nx, ny) in &[(0.0f32, 0.0f32), (1.0, 1.0), (f32::NAN, f32::INFINITY)] {
            let p = render_patch_rgba(&img, nx, ny, 512, 512, PatchRenderMode::DemosaicSrgb, 0.0);
            assert_eq!(p.desc.width, 300); // clamped to even active_width
            assert_eq!(p.desc.height, 202); // clamped to even active_height
            // Top-left border pixel must still decode Green > Red > Blue without color-swapped boundary reflection!
            assert!(
                p.rgba[1] > p.rgba[0] && p.rgba[0] > p.rgba[2],
                "Edge demosaic parity mismatch at ({nx}, {ny}): RGB = {:?}",
                &p.rgba[0..3]
            );
        }

        // Also verify X-Trans 6x6 noise & rendering on odd dimensions:
        let mut xtrans_cfa = Vec::with_capacity(36);
        for i in 0..36 {
            xtrans_cfa.push(match i % 6 {
                0 | 2 | 4 => 1, // Green
                1 | 5 => 0,     // Red
                _ => 2,         // Blue
            });
        }
        let mut xtrans_img = DecodedRawImage {
            meta: RawImageMetadata {
                mosaic_kind: MosaicKind::XTrans6x6,
                cfa_pattern: "X-Trans 6x6".into(),
                ..img.meta.clone()
            },
            stride,
            buffer_height: buf_h,
            cpp: 1,
            pixels: vec![600u16; stride * buf_h],
            active_rect: [ax, ay, aw, ah],
            bayer_offsets: None,
            generic_cfa: Some((6, 6, xtrans_cfa)),
            black_levels: [512.0; 4],
            white_levels: [16383.0; 4],
            wb_rgb: [1.0, 1.0, 1.0],
            cam_wb_to_srgb: [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]],
        };
        // Set R/B photosites to a different value (2000) while G stays at 600:
        // estimate_local_patch_sigma must filter Green-only (`sigma == 0.0`) instead of mixing R/B!
        for y in 0..ah {
            for x in 0..aw {
                if !matches!(xtrans_img.channel_at_active(x, y), 1 | 2) {
                    let idx = (ay + y) * stride + (ax + x);
                    xtrans_img.pixels[idx] = 2000;
                }
            }
        }
        let xt_noise = analyze_noise(&xtrans_img, "xtrans.raf");
        assert_eq!(xt_noise.local_patch_sigma_g, 0.0);
        let xt_ov = render_overview_rgba(&xtrans_img, 400, 0.0);
        assert!(xt_ov.desc.width > 0 && xt_ov.desc.height > 0);
    }

    #[test]
    fn test_linear_rgb_cpp3_and_cpp4_arq_four_plane_consistency() {
        let w = 240usize;
        let h = 180usize;

        // 1. 4-channel Sony Pixel Shift `.ARQ` layout: `cpp = 4`, `[0=R, 1=G1, 2=B, 3=G2]`,
        //    while canonical `black_levels` / `channels` are `[0=R, 1=G1, 2=G2, 3=B]`.
        let mut pixels4 = vec![0u16; w * h * 4];
        for y in 0..h {
            for x in 0..w {
                let base = (y * w + x) * 4;
                pixels4[base] = 500; // R constant at BL=500
                // G1 (c=1, BL=510): gentle low-contrast pattern
                pixels4[base + 1] = if ((x / 8) + (y / 8)) % 2 == 0 { 900 } else { 700 };
                // B (c=2, BL=530): constant + deterministic +-4 ADU pattern
                pixels4[base + 2] = if (x + y) % 2 == 0 { 534 } else { 526 };
                // G2 (c=3, BL=520): high-frequency high-contrast pattern + 10 hot pixels!
                pixels4[base + 3] = if ((x / 2) + (y / 2)) % 2 == 0 { 6000 } else { 800 };
            }
        }

        let arq_img = DecodedRawImage {
            meta: RawImageMetadata {
                make: "SONY".into(),
                model: "ILCE-7RM5".into(),
                camera_label: "SONY ILCE-7RM5".into(),
                lens_make: None,
                lens_model: None,
                iso: Some(100),
                exposure_time_sec: Some(0.01),
                shutter_display: Some("1/100s".into()),
                f_number: Some(4.0),
                focal_length_mm: Some(50.0),
                capture_time: None,
                raw_width: w as u32,
                raw_height: h as u32,
                active_x: 0,
                active_y: 0,
                active_width: w as u32,
                active_height: h as u32,
                bits_per_sample: 14,
                cfa_pattern: "Linear RGB".into(),
                mosaic_kind: MosaicKind::LinearRgb,
                black_levels: [500.0, 510.0, 520.0, 530.0],
                white_levels: [16380.0; 4],
                wb_multipliers: [1.0, 1.0, 1.0],
                orientation_exif: 1,
                format_name: "ARQ".into(),
                compression_name: "Uncompressed".into(),
                decoder_engine: "flashraw".into(),
                decode_ms: 0.1,
                warnings: vec![],
            },
            stride: w,
            buffer_height: h,
            cpp: 4,
            pixels: pixels4,
            active_rect: [0, 0, w, h],
            bayer_offsets: None,
            generic_cfa: None,
            black_levels: [500.0, 510.0, 520.0, 530.0],
            white_levels: [16380.0; 4],
            wb_rgb: [1.0, 1.0, 1.0],
            cam_wb_to_srgb: [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]],
        };

        let sharp = analyze_sharpness(&arq_img);
        let mc = &sharp.grid_3x3[4];
        assert!(
            mc.sharpness_g2 > mc.sharpness_g1 * 3.0,
            "cpp=4 ARQ must evaluate G2 from component 3 independently of G1: g1={}, g2={}",
            mc.sharpness_g1,
            mc.sharpness_g2
        );

        // Also test dark-frame noise on 4-plane ARQ where ONLY G2 (`c = 3`) has read noise + hot pixels:
        let mut dark4 = arq_img.pixels.clone();
        for y in 0..h {
            for x in 0..w {
                let base = (y * w + x) * 4;
                dark4[base] = 500;
                dark4[base + 1] = 510;
                dark4[base + 2] = 530;
                dark4[base + 3] = 520 + (((x * 37 + y * 13) % 7) as u16) - 3;
            }
        }
        for i in 0..12 {
            dark4[(i * 97) * 4 + 3] = 15000; // hot pixels on G2 (`c = 3`)
        }
        let arq_dark = DecodedRawImage {
            pixels: dark4,
            ..arq_img
        };
        let nrep = analyze_noise(&arq_dark, "pixelshift_dark.arq");
        assert_eq!(nrep.channels[0].read_noise_adu, 0.0); // R
        assert_eq!(nrep.channels[1].read_noise_adu, 0.0); // G1
        assert!(nrep.channels[2].read_noise_adu > 1.5, "G2 channel must capture c=3 noise"); // G2
        assert_eq!(nrep.channels[2].hot_pixel_count, 12);
        assert_eq!(nrep.channels[3].read_noise_adu, 0.0); // B

        let ov = render_overview_rgba(&arq_dark, 300, 0.0);
        let patch = render_patch_rgba(&arq_dark, 0.5, 0.5, 64, 64, PatchRenderMode::DemosaicSrgb, 0.0);
        assert_eq!(ov.rgba.len(), ov.desc.width as usize * ov.desc.height as usize * 4);
        assert_eq!(patch.rgba.len(), 64 * 64 * 4);
    }

    #[test]
    fn test_exif_orientation_upright_consistency() {
        // Base synthetic tilted chart has collapse toward Top-Left (`width=400, height=300`).
        // If stored sideways with EXIF Orientation = 6 (Rotate 90° CW to display upright),
        // upright dimensions must become `300 x 400`, and the sensor's Top-Left `(0, 0)` rotates
        // to upright Top-Right `(W-1, 0)`!
        let mut dng_rot6 = synthetic::generate_tilted_chart_dng(400, 300, 0.9);
        assert!(patch_le_tiff_tag_u32(&mut dng_rot6, 0x0112, 6));
        let img6 = decode_raw_bytes(&dng_rot6).expect("Orientation=6 DNG decode");
        assert_eq!(img6.meta.active_width, 300);
        assert_eq!(img6.meta.active_height, 400);
        assert_eq!(img6.meta.cfa_pattern, "GRBG");
        let rep6 = analyze_sharpness(&img6);
        assert!(
            rep6.tilt_vector.collapse_direction_label.contains("Top-Right"),
            "90° CW upright rotation of TL-tilted frame must point to Top-Right, got {}",
            rep6.tilt_vector.collapse_direction_label
        );

        // Orientation = 3 (180° rotation): dimensions stay `400 x 300`, CFA becomes `BGGR`,
        // and Top-Left collapse rotates to Bottom-Right!
        let mut dng_rot3 = synthetic::generate_tilted_chart_dng(400, 300, 0.9);
        assert!(patch_le_tiff_tag_u32(&mut dng_rot3, 0x0112, 3));
        let img3 = decode_raw_bytes(&dng_rot3).expect("Orientation=3 DNG decode");
        assert_eq!(img3.meta.active_width, 400);
        assert_eq!(img3.meta.active_height, 300);
        assert_eq!(img3.meta.cfa_pattern, "BGGR");
        let rep3 = analyze_sharpness(&img3);
        assert!(
            rep3.tilt_vector.collapse_direction_label.contains("Bottom-Right"),
            "180° upright rotation of TL-tilted frame must point to Bottom-Right, got {}",
            rep3.tilt_vector.collapse_direction_label
        );
    }

    #[test]
    fn test_center_clipped_sky_corners_collinear_wls_and_relocation() {
        use crate::sharpness::CellValidity;

        let flat_dng = synthetic::generate_tilted_chart_dng(600, 400, 0.0);
        let mut img = decode_raw_bytes(&flat_dng).unwrap();

        // 1. Clipped / saturated center (`MC` == 16383 -> `center_sharpness == 0`):
        // Must NEVER explode to `1.43e12` retention or `NaN`!
        let mut clipped_center = DecodedRawImage {
            meta: img.meta.clone(),
            stride: img.stride,
            buffer_height: img.buffer_height,
            cpp: img.cpp,
            pixels: img.pixels.clone(),
            active_rect: img.active_rect,
            bayer_offsets: img.bayer_offsets,
            generic_cfa: img.generic_cfa.clone(),
            black_levels: img.black_levels,
            white_levels: img.white_levels,
            wb_rgb: img.wb_rgb,
            cam_wb_to_srgb: img.cam_wb_to_srgb,
        };
        for y in 120..280 {
            for x in 200..400 {
                clipped_center.pixels[y * clipped_center.stride + x] = 16383;
            }
        }
        let clip_rep = analyze_sharpness(&clipped_center);
        assert_eq!(clip_rep.grid_3x3[4].validity, CellValidity::Clipped);
        assert_eq!(clip_rep.corner_retention.mean, 0.0);
        assert_eq!(clip_rep.asymmetry.max_diagonal_asymmetry, 0.0);
        assert_eq!(clip_rep.grade, OpticalGrade::InsufficientTexture);
        assert!(clip_rep.grid_3x3.iter().all(|c| c.relative_to_center.is_finite()));

        // 2. Landscape with uniform cloudless sky in Top row (`y < 150` uniform gray -> `LowTexture`)
        // and sharp ground in Center & Bottom rows: must NOT trigger false `SevereTilt` from sky vs ground!
        for y in 0..150 {
            for x in 0..600 {
                img.pixels[y * img.stride + x] = 3200;
            }
        }
        let sky_rep = analyze_sharpness(&img);
        assert_eq!(sky_rep.grid_3x3[0].validity, CellValidity::LowTexture);
        assert_eq!(sky_rep.grid_3x3[2].validity, CellValidity::LowTexture);
        assert_eq!(
            sky_rep.asymmetry.max_diagonal_asymmetry, 0.0,
            "Invalid LowTexture sky corners must not be differenced against sharp ground corners"
        );
        assert_ne!(sky_rep.grade, OpticalGrade::SevereTilt);

        // 3. Collinear valid stations (only middle horizontal row `ML, MC, MR` valid, top & bottom uniform):
        for y in 250..400 {
            for x in 0..600 {
                img.pixels[y * img.stride + x] = 3200;
            }
        }
        let col_rep = analyze_sharpness(&img);
        assert!(
            col_rep.tilt_vector.ty.abs() < 1e-4 && col_rep.tilt_vector.magnitude < 0.05,
            "Collinear single-row stations must have damped Y-slope without Tikhonov intercept leak, got {:?}",
            col_rep.tilt_vector
        );

        // 4. Isolated single-pixel warm spikes in dark noise must NOT be counted as stars:
        let dark_dng = synthetic::generate_dark_frame_dng(400, 300, 400);
        let dark_img = decode_raw_bytes(&dark_dng).unwrap();
        let dark_sharp = analyze_sharpness(&dark_img);
        let total_false_stars: u32 = dark_sharp.grid_3x3.iter().map(|c| c.star_count).sum();
        assert_eq!(total_false_stars, 0, "Hot/warm single pixels must not trigger star HFR");

        // 5. Station relocation updates all coupled metrics (`center_sharpness`, `relative_to_center`,
        // `corner_retention`, `asymmetry`, `tilt_vector`, `grade`, `verdict_title`) without stale `grid_5x5` override:
        let flat_dng = synthetic::generate_tilted_chart_dng(600, 400, 0.0);
        let mut flat_img = decode_raw_bytes(&flat_dng).unwrap();
        let st = flat_img.stride;
        // Populate a spatially homogeneous 14-bit Bayer brick/checkerboard wall across the sensor,
        // then blur canonical `TL` `(4..108, 4..74)` to simulate a foreground obstruction:
        for y in 0..400usize {
            for x in 0..600usize {
                let chk = if ((x / 4) + (y / 4)) % 2 == 0 {
                    9200u16
                } else {
                    2400u16
                };
                let gain = match (x & 1, y & 1) {
                    (0, 0) => 50,  // R
                    (1, 1) => 62,  // B
                    _ => 100,      // G1 / G2
                };
                flat_img.pixels[y * st + x] = 512 + ((chk as u32 * gain) / 100) as u16;
            }
        }
        for _ in 0..6 {
            let cur = flat_img.pixels.clone();
            for y in 4..74 {
                for x in 4..108 {
                    let sum = cur[(y - 2) * st + x] as u32
                        + cur[(y + 2) * st + x] as u32
                        + cur[y * st + (x - 2)] as u32
                        + cur[y * st + (x + 2)] as u32
                        + cur[y * st + x] as u32 * 2;
                    flat_img.pixels[y * st + x] = (sum / 6) as u16;
                }
            }
        }
        let base_rep = analyze_sharpness(&flat_img);
        assert!(
            base_rep.corner_retention.tl < 0.35 && base_rep.tilt_vector.magnitude > 0.10,
            "Localized foreground blur at canonical TL should initially depress TL retention and induce apparent tilt"
        );

        // Relocate `MC` (`idx = 4`) to `(0.53, 0.52)` and relocate `TL` (`idx = 0`) to `(0.28, 0.28)`
        // clear of the foreground obstacle:
        let mut custom_3x3 = base_rep.grid_3x3.clone();
        custom_3x3[4] = evaluate_custom_roi(&flat_img, "MC", 1, 1, 0.53, 0.52, 0.0);
        custom_3x3[0] = evaluate_custom_roi(
            &flat_img,
            "TL",
            0,
            0,
            0.28,
            0.28,
            custom_3x3[4].sharpness,
        );
        let reloc_rep = recompute_report_with_custom_3x3(custom_3x3, base_rep.grid_5x5.clone());
        assert!((reloc_rep.center_sharpness - reloc_rep.grid_3x3[4].sharpness).abs() < 1e-9);
        assert!((reloc_rep.grid_3x3[4].relative_to_center - 1.0).abs() < 1e-6);
        for cell in &reloc_rep.grid_3x3 {
            assert!(
                (cell.relative_to_center - cell.sharpness / reloc_rep.center_sharpness).abs() < 1e-6
            );
        }
        assert!(
            reloc_rep.corner_retention.tl > 0.95,
            "Relocated TL retention should recover to ~1.0 once clear of foreground blur"
        );
        assert!(
            reloc_rep.tilt_vector.magnitude < 0.02,
            "Custom 3x3 relocation must update WLS tilt_vector without being overridden by stale grid_5x5, got {:?}",
            reloc_rep.tilt_vector
        );
        assert_eq!(reloc_rep.grade, OpticalGrade::Excellent);
    }

    #[test]
    fn test_noise_zero_sigma_inverted_wl_single_duplicate_and_missing_iso() {
        // 1. Constant zero-noise frame (`sigma == 0`) & inverted `white_level <= black_level`:
        let dng = synthetic::generate_dark_frame_dng(200, 160, 100);
        let mut const_img = decode_raw_bytes(&dng).unwrap();
        const_img.pixels.fill(512);
        let zero_rep = analyze_noise(&const_img, "zero_noise.dng");
        assert_eq!(zero_rep.mean_read_noise_adu, 0.0);
        assert!(zero_rep.mean_engineering_dr_ev.is_finite() && zero_rep.mean_engineering_dr_ev > 14.0);

        // Inverted white_level <= black_level (`500 <= 1000`): DR must be 0.0 EV (not 1.79 EV or NaN)
        // and rendering must not divide by zero or produce NaN!
        const_img.black_levels = [1000.0; 4];
        const_img.white_levels = [500.0; 4];
        let inv_rep = analyze_noise(&const_img, "inverted_wl.dng");
        assert_eq!(inv_rep.mean_engineering_dr_ev, 0.0);
        let inv_ov = render_overview_rgba(&const_img, 200, 2.0);
        assert!(
            inv_ov
                .rgba
                .as_chunks::<4>()
                .0
                .iter()
                .all(|px| px[0] == 0 && px[3] == 255)
        );

        // 2. Single dark frame in `analyze_iso_series`:
        let f100_a = analyze_noise(
            &decode_raw_bytes(&synthetic::generate_dark_frame_dng(200, 160, 100)).unwrap(),
            "iso100_a.dng",
        );
        let single_series = analyze_iso_series(vec![f100_a.clone()]);
        assert_eq!(single_series.frames.len(), 1);
        assert!(single_series.inflections.is_empty());

        // 3. Multiple frames at the EXACT SAME ISO (`ISO 100` x 3 with different noise levels):
        // Must compute exact 1/3 arithmetic average and zero division-by-zero / zero false inflections!
        let mut f100_b = f100_a.clone();
        f100_b.filename = "iso100_b.dng".into();
        f100_b.mean_read_noise_adu = 2.0;
        f100_b.mean_read_noise_iso100_norm = Some(2.0);
        let mut f100_c = f100_a.clone();
        f100_c.filename = "iso100_c.dng".into();
        f100_c.mean_read_noise_adu = 8.0;
        f100_c.mean_read_noise_iso100_norm = Some(8.0);
        let mut f100_a_mod = f100_a.clone();
        f100_a_mod.mean_read_noise_adu = 2.0;
        f100_a_mod.mean_read_noise_iso100_norm = Some(2.0);

        let dup_series = analyze_iso_series(vec![f100_a_mod, f100_b, f100_c]);
        assert_eq!(dup_series.frames.len(), 3);
        assert!(dup_series.inflections.is_empty());
        // Exact 1/3 mean of (2.0, 2.0, 8.0) is 4.00 ADU (whereas buggy pairwise 0.5*(0.5*(2+2)+8) gave 5.00 ADU!):
        assert!(
            dup_series.summary.contains("4.00 ADU"),
            "Expected exact 1/3 mean 4.00 ADU in summary, got: {}",
            dup_series.summary
        );

        // 4. Missing EXIF ISO (`iso == None` or `iso == Some(0)`) mixed into a real ISO sequence:
        // Previously defaulted to `ISO 100` and hallucinated a fake Dual Native ISO HCG cliff!
        let mut high_noise_missing_iso_dng = synthetic::generate_dark_frame_dng(200, 160, 6400);
        assert!(patch_le_tiff_tag_u32(&mut high_noise_missing_iso_dng, 0x8827, 0));
        assert!(patch_le_tiff_tag_u32(&mut high_noise_missing_iso_dng, 0x8832, 0));
        let decoded_no_iso = decode_raw_bytes(&high_noise_missing_iso_dng).unwrap();
        assert_eq!(decoded_no_iso.meta.iso, None);

        let rep_no_iso = analyze_noise(&decoded_no_iso, "unlabelled_iso6400.dng");
        assert_eq!(rep_no_iso.iso, 0);
        assert!(rep_no_iso.mean_read_noise_iso100_norm.is_none());

        let f200 = analyze_noise(
            &decode_raw_bytes(&synthetic::generate_dark_frame_dng(200, 160, 200)).unwrap(),
            "iso200.dng",
        );
        let f400 = analyze_noise(
            &decode_raw_bytes(&synthetic::generate_dark_frame_dng(200, 160, 400)).unwrap(),
            "iso400.dng",
        );
        let mixed = analyze_iso_series(vec![rep_no_iso, f100_a, f200, f400]);
        assert!(
            mixed.inflections.is_empty(),
            "Unlabelled dark frame must NEVER trigger a fake HCG inflection, got {:?}",
            mixed.inflections
        );
        assert_eq!(mixed.frames.last().unwrap().iso, 0);
    }
}
