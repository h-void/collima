//! Pre-demosaic Green-channel optical sharpness & focal-plane tilt diagnostics.
//!
//! Computes illumination-invariant, black-level-subtracted, noise-floor-thresholded Tenengrad
//! energy independently on the `G1` and `G2` Bayer sub-planes (avoiding 45° diagonal binning
//! blur and lateral chromatic aberration), plus point-source Star HFR estimation and WLS
//! Tilt-vs-Field-Curvature decomposition.

use serde::{Deserialize, Serialize};

use crate::decoder::{DecodedRawImage, MosaicKind};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CellValidity {
    Valid,
    LowTexture,
    Underexposed,
    Clipped,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GridCellMetrics {
    pub id: String,
    pub row: usize,
    pub col: usize,
    /// Normalized center X in `[0.0, 1.0]` within active sensor area.
    pub norm_x: f32,
    /// Normalized center Y in `[0.0, 1.0]` within active sensor area.
    pub norm_y: f32,
    /// ROI rectangle `[x, y, width, height]` in active sensor pixels.
    pub sensor_rect: [u32; 4],
    /// Combined Green sharpness score `0.5 * (S_g1 + S_g2)`.
    pub sharpness: f64,
    pub sharpness_g1: f64,
    pub sharpness_g2: f64,
    /// Ratio `sharpness / center_sharpness` (`1.0` at center).
    pub relative_to_center: f64,
    /// Mean black-subtracted normalized optical signal in `[0.0, 1.0]`.
    pub mean_signal_norm: f64,
    /// Fraction of pixels exceeding the noise-floor gradient threshold.
    pub edge_density: f64,
    /// Fraction of saturated pixels near white level.
    pub clipped_fraction: f64,
    pub validity: CellValidity,
    /// Detected point-source star count (for astrophotography starfields).
    pub star_count: u32,
    /// Median Half-Flux Radius in sensor pixels when `star_count > 0`.
    pub median_star_hfr_px: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CornerRetention {
    pub tl: f64,
    pub tr: f64,
    pub bl: f64,
    pub br: f64,
    pub mean: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EdgeRetention {
    pub top: f64,
    pub bottom: f64,
    pub left: f64,
    pub right: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AsymmetryMetrics {
    /// `|S_TL - S_BR| / S_center`
    pub tl_br_diff: f64,
    /// `|S_TR - S_BL| / S_center`
    pub tr_bl_diff: f64,
    /// `(S_right - S_left) / S_center`
    pub left_right_balance: f64,
    /// `(S_bottom - S_top) / S_center`
    pub top_bottom_balance: f64,
    pub max_diagonal_asymmetry: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TiltVector {
    /// Horizontal tilt gradient component (`+` = sharper toward Right, `-` = sharper toward Left).
    pub tx: f64,
    /// Vertical tilt gradient component (`+` = sharper toward Bottom, `-` = sharper toward Top).
    pub ty: f64,
    /// Normalized tilt strength (`sqrt(tx^2 + ty^2)`). `< 0.09` excellent/normal curvature, `0.09..0.20` mild, `>= 0.20` significant.
    pub magnitude: f64,
    /// Direction of peak sharpness plane tilt in degrees (`0° = Right`, `90° = Bottom`, `180° = Left`, `-90° = Top`).
    pub angle_deg: f64,
    /// Opposite direction (side experiencing sharpness collapse), in degrees.
    pub collapse_angle_deg: f64,
    pub collapse_direction_label: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OpticalGrade {
    Excellent,
    NormalCurvature,
    MildTilt,
    SevereTilt,
    InsufficientTexture,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SharpnessReport {
    /// 9-station inspection grid (`TL, TC, TR, ML, MC, MR, BL, BC, BR`) at optical center & 10%-inset stations.
    pub grid_3x3: Vec<GridCellMetrics>,
    /// Full-coverage 5x5 tile grid (25 cells) for smooth contour heatmap rendering.
    pub grid_5x5: Vec<GridCellMetrics>,
    pub center_sharpness: f64,
    pub corner_retention: CornerRetention,
    pub edge_retention: EdgeRetention,
    pub asymmetry: AsymmetryMetrics,
    pub tilt_vector: TiltVector,
    /// Symmetric radial falloff coefficient (`> 0` indicates normal center-to-corner field curvature / MTF falloff).
    pub radial_falloff: f64,
    pub valid_cells_3x3: usize,
    pub valid_cells_5x5: usize,
    pub grade: OpticalGrade,
    pub verdict_title: String,
    pub notes: Vec<String>,
}

const LABELS_3X3: [[&str; 3]; 3] = [
    ["TL", "TC", "TR"],
    ["ML", "MC", "MR"],
    ["BL", "BC", "BR"],
];

/// Perform full 3x3 + 5x5 pre-demosaic Green sharpness and optical tilt diagnostics.
pub fn analyze_sharpness(img: &DecodedRawImage) -> SharpnessReport {
    let [_, _, aw, ah] = img.active_rect;

    // 1. Evaluate 3x3 optical stations: u, v in {0.10, 0.50, 0.90}, ROI size = 14% of active dims.
    let roi_w = ((aw as f32 * 0.14) as usize).clamp(32, aw);
    let roi_h = ((ah as f32 * 0.14) as usize).clamp(32, ah);
    let coords_3 = [0.10f32, 0.50f32, 0.90f32];

    let mut grid_3x3 = Vec::with_capacity(9);
    for (r, &ny) in coords_3.iter().enumerate() {
        for (c, &nx) in coords_3.iter().enumerate() {
            let cell = evaluate_station(
                img,
                LABELS_3X3[r][c].to_string(),
                r,
                c,
                nx,
                ny,
                roi_w,
                roi_h,
            );
            grid_3x3.push(cell);
        }
    }

    let center_raw = grid_3x3[4].sharpness;
    let center_ok = grid_3x3[4].validity == CellValidity::Valid && center_raw > 1e-6;
    for cell in &mut grid_3x3 {
        cell.relative_to_center = if center_ok {
            cell.sharpness / center_raw
        } else {
            0.0
        };
    }

    // 2. Evaluate contiguous 5x5 tiles covering 100% of active sensor frame for heatmap.
    let mut grid_5x5 = Vec::with_capacity(25);
    let tile_w = (aw / 5).max(8);
    let tile_h = (ah / 5).max(8);
    for r in 0..5 {
        for c in 0..5 {
            let x0 = c * tile_w;
            let y0 = r * tile_h;
            let w = if c == 4 { aw - x0 } else { tile_w };
            let h = if r == 4 { ah - y0 } else { tile_h };
            let nx = (x0 as f32 + 0.5 * w as f32) / aw as f32;
            let ny = (y0 as f32 + 0.5 * h as f32) / ah as f32;
            let mut cell = evaluate_rect(img, format!("R{}C{}", r, c), r, c, nx, ny, x0, y0, w, h);
            cell.relative_to_center = if center_ok {
                cell.sharpness / center_raw
            } else {
                0.0
            };
            grid_5x5.push(cell);
        }
    }
    // Normalize 5x5 relative_to_center consistently with custom station recomputation.
    let norm_5 = effective_5x5_center_ref(&grid_3x3, &grid_5x5);
    for cell in &mut grid_5x5 {
        cell.relative_to_center = match norm_5 {
            Some(ref_val) => cell.sharpness / ref_val,
            None => 0.0,
        };
    }

    compute_report_from_grids(grid_3x3, grid_5x5)
}

/// Re-evaluate sharpness of a single custom ROI centered at `(norm_x, norm_y)` when the user
/// drags a viewport in the 9-grid inspector, and recompute the full report if desired.
pub fn evaluate_custom_roi(
    img: &DecodedRawImage,
    id: &str,
    row: usize,
    col: usize,
    norm_x: f32,
    norm_y: f32,
    center_sharpness: f64,
) -> GridCellMetrics {
    let [_, _, aw, ah] = img.active_rect;
    let roi_w = ((aw as f32 * 0.14) as usize).clamp(32, aw);
    let roi_h = ((ah as f32 * 0.14) as usize).clamp(32, ah);
    let mut cell = evaluate_station(img, id.to_string(), row, col, norm_x, norm_y, roi_w, roi_h);
    cell.relative_to_center = if center_sharpness.is_finite() && center_sharpness > 1e-6 {
        cell.sharpness / center_sharpness
    } else {
        0.0
    };
    cell
}

/// Recompute optical summary metrics after one or more 3x3 stations have been dragged by the user.
///
/// Retains the full 5x5 background field in the WLS tilt/curvature fit while smoothly attenuating
/// any canonical 5x5 tile whose paired 3x3 station was moved away from it, preventing discontinuous
/// `(tx, ty, cr)` jumps on zero-distance or small drags while still letting relocated stations escape
/// localized foreground obstructions.
pub fn recompute_report_with_custom_3x3(
    mut grid_3x3: Vec<GridCellMetrics>,
    mut grid_5x5: Vec<GridCellMetrics>,
) -> SharpnessReport {
    let (center_raw, center_ok) = grid_3x3
        .get(4)
        .map(|c| (c.sharpness, c.validity == CellValidity::Valid && c.sharpness > 1e-6))
        .unwrap_or((0.0, false));
    for cell in &mut grid_3x3 {
        cell.relative_to_center = if center_ok {
            cell.sharpness / center_raw
        } else {
            0.0
        };
    }
    let norm_5 = effective_5x5_center_ref(&grid_3x3, &grid_5x5);
    for cell in &mut grid_5x5 {
        cell.relative_to_center = match norm_5 {
            Some(ref_val) => cell.sharpness / ref_val,
            None => 0.0,
        };
    }
    compute_report_from_grids(grid_3x3, grid_5x5)
}

fn compute_report_from_grids(
    grid_3x3: Vec<GridCellMetrics>,
    grid_5x5: Vec<GridCellMetrics>,
) -> SharpnessReport {
    let center_sharpness = grid_3x3[4].sharpness;
    let center_validity = grid_3x3[4].validity;
    let center_ok = center_validity == CellValidity::Valid && center_sharpness > 1e-6;

    let ret = |idx: usize| -> f64 {
        if center_ok {
            grid_3x3[idx].sharpness / center_sharpness
        } else {
            0.0
        }
    };
    let is_valid = |idx: usize| -> bool { grid_3x3[idx].validity == CellValidity::Valid };

    let tl = ret(0);
    let tc = ret(1);
    let tr = ret(2);
    let ml = ret(3);
    let mr = ret(5);
    let bl = ret(6);
    let bc = ret(7);
    let br = ret(8);

    let corner_pairs = [(0usize, tl), (2, tr), (6, bl), (8, br)];
    let valid_corner_vals: Vec<f64> = corner_pairs
        .iter()
        .filter(|&&(idx, _)| center_ok && is_valid(idx))
        .map(|&(_, v)| v)
        .collect();
    let corner_mean = if !valid_corner_vals.is_empty() {
        valid_corner_vals.iter().sum::<f64>() / valid_corner_vals.len() as f64
    } else {
        0.25 * (tl + tr + bl + br)
    };

    let corner_retention = CornerRetention {
        tl,
        tr,
        bl,
        br,
        mean: corner_mean,
    };
    let edge_retention = EdgeRetention {
        top: tc,
        bottom: bc,
        left: ml,
        right: mr,
    };

    // Only compare diagonal / opposing station pairs when BOTH stations contain valid planar texture,
    // preventing pure blue sky or clipped highlights in one corner from masquerading as lens tilt.
    let tl_br_diff = if center_ok && is_valid(0) && is_valid(8) {
        (tl - br).abs()
    } else {
        0.0
    };
    let tr_bl_diff = if center_ok && is_valid(2) && is_valid(6) {
        (tr - bl).abs()
    } else {
        0.0
    };

    let mut lr_sum = 0.0f64;
    let mut lr_cnt = 0usize;
    for &(li, ri, lv, rv) in &[(0usize, 2usize, tl, tr), (3, 5, ml, mr), (6, 8, bl, br)] {
        if center_ok && is_valid(li) && is_valid(ri) {
            lr_sum += rv - lv;
            lr_cnt += 1;
        }
    }
    let lr_bal = if lr_cnt > 0 {
        lr_sum / lr_cnt as f64
    } else {
        0.0
    };

    let mut tb_sum = 0.0f64;
    let mut tb_cnt = 0usize;
    for &(ti, bi, tv, bv) in &[(0usize, 6usize, tl, bl), (1, 7, tc, bc), (2, 8, tr, br)] {
        if center_ok && is_valid(ti) && is_valid(bi) {
            tb_sum += bv - tv;
            tb_cnt += 1;
        }
    }
    let tb_bal = if tb_cnt > 0 {
        tb_sum / tb_cnt as f64
    } else {
        0.0
    };

    let asymmetry = AsymmetryMetrics {
        tl_br_diff,
        tr_bl_diff,
        left_right_balance: lr_bal,
        top_bottom_balance: tb_bal,
        max_diagonal_asymmetry: tl_br_diff.max(tr_bl_diff),
    };

    let valid_3x3 = grid_3x3
        .iter()
        .filter(|c| c.validity == CellValidity::Valid)
        .count();
    let valid_5x5 = grid_5x5
        .iter()
        .filter(|c| c.validity == CellValidity::Valid)
        .count();

    // Fit normalized surface r(u, v) = c0 + tx * u + ty * v - cr * (u^2 + v^2) / 2
    let (tx, ty, radial_falloff) = fit_tilt_and_curvature(&grid_3x3, &grid_5x5);

    let mag = (tx * tx + ty * ty).sqrt();
    let angle_deg = if mag > 1e-6 {
        ty.atan2(tx).to_degrees()
    } else {
        0.0
    };
    let collapse_angle = normalize_deg(angle_deg + 180.0);
    let mut collapse_label = direction_label(collapse_angle, mag);
    if collapse_label == "Centered" && asymmetry.max_diagonal_asymmetry >= 0.16 && center_ok {
        let corner_labels = [
            (0usize, tl, "Top-Left (TL)"),
            (2, tr, "Top-Right (TR)"),
            (6, bl, "Bottom-Left (BL)"),
            (8, br, "Bottom-Right (BR)"),
        ];
        if let Some(&(_, _, lbl)) = corner_labels
            .iter()
            .filter(|&&(idx, _, _)| is_valid(idx))
            .min_by(|a, b| a.1.total_cmp(&b.1))
        {
            collapse_label = lbl.to_string();
        }
    }

    let tilt_vector = TiltVector {
        tx,
        ty,
        magnitude: mag,
        angle_deg,
        collapse_angle_deg: collapse_angle,
        collapse_direction_label: collapse_label.clone(),
    };

    let mut notes = Vec::new();
    let low_tex_corners = [0usize, 2, 6, 8]
        .iter()
        .filter(|&&idx| grid_3x3[idx].validity != CellValidity::Valid)
        .count();

    if low_tex_corners > 0 {
        notes.push(format!(
            "{} of 4 corner stations lack uniform high-frequency texture (e.g. sky, defocus, or highlight clipping); drag those loupe boxes onto textured features or shoot a planar target.",
            low_tex_corners
        ));
    }

    let total_stars: u32 = grid_3x3.iter().map(|c| c.star_count).sum();
    if total_stars >= 9 {
        notes.push(format!(
            "Detected {} point-source star profiles across the 9 stations; per-cell median Star HFR (px) is available alongside Tenengrad.",
            total_stars
        ));
    }

    let (grade, verdict_title) = if !center_ok || valid_3x3 < 5 {
        notes.push(
            "Insufficient valid textured stations to separate mount tilt from scene framing."
                .to_string(),
        );
        (
            OpticalGrade::InsufficientTexture,
            "Insufficient Planar Texture — Adjust ROI or Target".to_string(),
        )
    } else if mag >= 0.20 || asymmetry.max_diagonal_asymmetry >= 0.30 {
        notes.push(format!(
            "Asymmetric sharpness plane collapse toward {} (tilt magnitude {:.2}, diagonal Δ {:.1}%). Verify camera-to-target perpendicularity; if confirmed on a starfield or aligned chart, check mount flange / adapter shimming or lens decentering.",
            collapse_label,
            mag,
            asymmetry.max_diagonal_asymmetry * 100.0
        ));
        (
            OpticalGrade::SevereTilt,
            format!("Significant Focal-Plane Tilt Detected ({collapse_label})"),
        )
    } else if mag >= 0.09 || asymmetry.max_diagonal_asymmetry >= 0.16 {
        notes.push(format!(
            "Mild directional asymmetry toward {} (tilt {:.2}, diagonal Δ {:.1}%). Typical of fast wide-angle tolerances or slight target yaw (<2°).",
            collapse_label,
            mag,
            asymmetry.max_diagonal_asymmetry * 100.0
        ));
        (
            OpticalGrade::MildTilt,
            format!("Mild Optical Asymmetry / Tilt ({collapse_label})"),
        )
    } else if valid_corner_vals.len() >= 2 && corner_retention.mean < 0.68 && radial_falloff > 0.15 {
        notes.push(format!(
            "Corners decay symmetrically (mean corner retention {:.0}%, diagonal Δ {:.1}%), indicating normal wide-open field curvature / sagittal-meridional MTF falloff rather than mount tilt.",
            corner_retention.mean * 100.0,
            asymmetry.max_diagonal_asymmetry * 100.0
        ));
        (
            OpticalGrade::NormalCurvature,
            "Well-Centered Axis — Symmetric Field Curvature".to_string(),
        )
    } else {
        notes.push(format!(
            "High optical coaxiality: mean corner retention {:.0}% with minimal diagonal asymmetry ({:.1}%).",
            corner_retention.mean * 100.0,
            asymmetry.max_diagonal_asymmetry * 100.0
        ));
        (
            OpticalGrade::Excellent,
            "Excellent Optical Collimation & Flatness".to_string(),
        )
    };

    SharpnessReport {
        grid_3x3,
        grid_5x5,
        center_sharpness,
        corner_retention,
        edge_retention,
        asymmetry,
        tilt_vector,
        radial_falloff,
        valid_cells_3x3: valid_3x3,
        valid_cells_5x5: valid_5x5,
        grade,
        verdict_title,
        notes,
    }
}

#[allow(clippy::too_many_arguments)]
fn evaluate_station(
    img: &DecodedRawImage,
    id: String,
    row: usize,
    col: usize,
    norm_x: f32,
    norm_y: f32,
    roi_w: usize,
    roi_h: usize,
) -> GridCellMetrics {
    let [_, _, aw, ah] = img.active_rect;
    let safe_nx = if norm_x.is_finite() {
        norm_x.clamp(0.02, 0.98)
    } else {
        0.5
    };
    let safe_ny = if norm_y.is_finite() {
        norm_y.clamp(0.02, 0.98)
    } else {
        0.5
    };
    let cx = (safe_nx * aw as f32).round() as isize;
    let cy = (safe_ny * ah as f32).round() as isize;

    let x0 = ((cx - roi_w as isize / 2).clamp(0, (aw - roi_w) as isize) as usize) & !1;
    let y0 = ((cy - roi_h as isize / 2).clamp(0, (ah - roi_h) as isize) as usize) & !1;
    let w = (roi_w.min(aw - x0)) & !1;
    let h = (roi_h.min(ah - y0)) & !1;

    let actual_nx = (x0 as f32 + 0.5 * w as f32) / aw as f32;
    let actual_ny = (y0 as f32 + 0.5 * h as f32) / ah as f32;

    evaluate_rect(img, id, row, col, actual_nx, actual_ny, x0, y0, w, h)
}

#[allow(clippy::too_many_arguments)]
fn evaluate_rect(
    img: &DecodedRawImage,
    id: String,
    row: usize,
    col: usize,
    norm_x: f32,
    norm_y: f32,
    x0: usize,
    y0: usize,
    w: usize,
    h: usize,
) -> GridCellMetrics {
    let [_, _, aw, ah] = img.active_rect;
    let x0 = (x0 & !1).min(aw.saturating_sub(4));
    let y0 = (y0 & !1).min(ah.saturating_sub(4));
    let w = (w & !1).clamp(4, aw.saturating_sub(x0));
    let h = (h & !1).clamp(4, ah.saturating_sub(y0));

    match img.meta.mosaic_kind {
        MosaicKind::Bayer2x2 => {
            let bo = img.bayer_offsets.expect("Bayer2x2 offsets");
            let qw = w / 2;
            let qh = h / 2;

            let p1 = eval_green_subplane(img, x0, y0, qw, qh, bo.g1, 1);
            let p2 = eval_green_subplane(img, x0, y0, qw, qh, bo.g2, 2);

            let sharpness = 0.5 * (p1.score + p2.score);
            let mean_signal_norm = 0.5 * (p1.mean_norm + p2.mean_norm);
            let edge_density = 0.5 * (p1.edge_density + p2.edge_density);
            let clipped_fraction = 0.5 * (p1.clipped_frac + p2.clipped_frac);
            let star_count = p1.star_count;
            let median_star_hfr_px = p1.median_hfr_px.map(|hfr_sub| hfr_sub * 2.0);

            let blank_quads = p1.blank_quads.max(p2.blank_quads);
            let validity = classify_validity(
                mean_signal_norm,
                edge_density,
                blank_quads,
                clipped_fraction,
                star_count,
            );

            GridCellMetrics {
                id,
                row,
                col,
                norm_x,
                norm_y,
                sensor_rect: [x0 as u32, y0 as u32, w as u32, h as u32],
                sharpness,
                sharpness_g1: p1.score,
                sharpness_g2: p2.score,
                relative_to_center: 1.0,
                mean_signal_norm,
                edge_density,
                clipped_fraction,
                validity,
                star_count,
                median_star_hfr_px,
            }
        }
        MosaicKind::LinearRgb => {
            let p1 = eval_linear_component(img, x0, y0, w, h, 1, 1);
            let (
                sharpness,
                sharpness_g1,
                sharpness_g2,
                mean_norm,
                edge_density,
                blank_quads,
                clipped_frac,
                star_count,
                median_hfr_px,
            ) = if img.cpp >= 4 {
                // 4-plane Pixel Shift (.ARQ / 4-plane Linear DNG): [0=R, 1=G1, 2=B, 3=G2]
                let p2 = eval_linear_component(img, x0, y0, w, h, 3, 2);
                let hfr = match (p1.median_hfr_px, p2.median_hfr_px) {
                    (Some(a), Some(b)) => Some(0.5 * (a + b)),
                    (Some(a), None) => Some(a),
                    (None, Some(b)) => Some(b),
                    (None, None) => None,
                };
                (
                    0.5 * (p1.score + p2.score),
                    p1.score,
                    p2.score,
                    0.5 * (p1.mean_norm + p2.mean_norm),
                    0.5 * (p1.edge_density + p2.edge_density),
                    p1.blank_quads.max(p2.blank_quads),
                    0.5 * (p1.clipped_frac + p2.clipped_frac),
                    p1.star_count.max(p2.star_count),
                    hfr,
                )
            } else {
                (
                    p1.score,
                    p1.score,
                    p1.score,
                    p1.mean_norm,
                    p1.edge_density,
                    p1.blank_quads,
                    p1.clipped_frac,
                    p1.star_count,
                    p1.median_hfr_px,
                )
            };
            let validity = classify_validity(
                mean_norm,
                edge_density,
                blank_quads,
                clipped_frac,
                star_count,
            );
            GridCellMetrics {
                id,
                row,
                col,
                norm_x,
                norm_y,
                sensor_rect: [x0 as u32, y0 as u32, w as u32, h as u32],
                sharpness,
                sharpness_g1,
                sharpness_g2,
                relative_to_center: 1.0,
                mean_signal_norm: mean_norm,
                edge_density,
                clipped_fraction: clipped_frac,
                validity,
                star_count,
                median_star_hfr_px: median_hfr_px,
            }
        }
        MosaicKind::XTrans6x6 | MosaicKind::OtherSinglePlane => {
            // Evaluate on 2x2 block green average for non-Bayer single-plane mosaics.
            let qw = w / 2;
            let qh = h / 2;
            let p = eval_generic_green_blocks(img, x0, y0, qw, qh);
            let validity = classify_validity(
                p.mean_norm,
                p.edge_density,
                p.blank_quads,
                p.clipped_frac,
                p.star_count,
            );
            GridCellMetrics {
                id,
                row,
                col,
                norm_x,
                norm_y,
                sensor_rect: [x0 as u32, y0 as u32, w as u32, h as u32],
                sharpness: p.score,
                sharpness_g1: p.score,
                sharpness_g2: p.score,
                relative_to_center: 1.0,
                mean_signal_norm: p.mean_norm,
                edge_density: p.edge_density,
                clipped_fraction: p.clipped_frac,
                validity,
                star_count: p.star_count,
                median_star_hfr_px: p.median_hfr_px.map(|v| v * 2.0),
            }
        }
    }
}

struct SubplaneResult {
    score: f64,
    mean_norm: f64,
    edge_density: f64,
    blank_quads: u8,
    clipped_frac: f64,
    star_count: u32,
    median_hfr_px: Option<f64>,
}

fn classify_validity(
    mean_norm: f64,
    edge_density: f64,
    blank_quads: u8,
    clipped_frac: f64,
    star_count: u32,
) -> CellValidity {
    if clipped_frac > 0.22 {
        CellValidity::Clipped
    } else if mean_norm < 0.006 && star_count == 0 {
        CellValidity::Underexposed
    } else if (edge_density < 0.006 || blank_quads >= 2) && star_count < 2 {
        CellValidity::LowTexture
    } else {
        CellValidity::Valid
    }
}

/// Evaluate local-mean-normalized, noise-floor-thresholded Tenengrad on a single uniform
/// Green sub-plane (`G1` or `G2`) of dimensions `qw x qh`.
fn eval_green_subplane(
    img: &DecodedRawImage,
    x0: usize,
    y0: usize,
    qw: usize,
    qh: usize,
    offset: (usize, usize),
    ch_idx: usize,
) -> SubplaneResult {
    if qw < 4 || qh < 4 {
        return SubplaneResult {
            score: 0.0,
            mean_norm: 0.0,
            edge_density: 0.0,
            blank_quads: 4,
            clipped_frac: 0.0,
            star_count: 0,
            median_hfr_px: None,
        };
    }

    let [ax, ay, _, _] = img.active_rect;
    let bl = img.black_levels[ch_idx] as f64;
    let span = (img.white_levels[ch_idx] as f64 - bl).max(1.0);
    let clip_ceil = 0.975 * span;

    // Extract contiguous sub-plane values in net ADU (`raw - black_level`, clamped >= 0).
    let mut plane = vec![0.0f32; qw * qh];
    let mut sum_adu = 0.0f64;
    let mut clipped_cnt = 0usize;

    for r in 0..qh {
        let sy = ay + y0 + r * 2 + offset.1;
        let row_base = sy * img.stride;
        for c in 0..qw {
            let sx = ax + x0 + c * 2 + offset.0;
            let raw = img.pixels[row_base + sx] as f64;
            let net = (raw - bl).max(0.0);
            if net >= clip_ceil {
                clipped_cnt += 1;
            }
            sum_adu += net;
            plane[r * qw + c] = net as f32;
        }
    }

    eval_scalar_plane(&plane, qw, qh, sum_adu, clipped_cnt, span, clip_ceil as f32)
}

fn eval_linear_component(
    img: &DecodedRawImage,
    x0: usize,
    y0: usize,
    w: usize,
    h: usize,
    comp_idx: usize,
    ch_idx: usize,
) -> SubplaneResult {
    if w < 4 || h < 4 {
        return SubplaneResult {
            score: 0.0,
            mean_norm: 0.0,
            edge_density: 0.0,
            blank_quads: 4,
            clipped_frac: 0.0,
            star_count: 0,
            median_hfr_px: None,
        };
    }

    let bl = img.black_levels[ch_idx] as f64;
    let span = (img.white_levels[ch_idx] as f64 - bl).max(1.0);
    let clip_ceil = 0.975 * span;

    let mut plane = vec![0.0f32; w * h];
    let mut sum_adu = 0.0f64;
    let mut clipped_cnt = 0usize;

    for r in 0..h {
        for c in 0..w {
            let raw = img.active_sample(x0 + c, y0 + r, comp_idx) as f64;
            let net = (raw - bl).max(0.0);
            if net >= clip_ceil {
                clipped_cnt += 1;
            }
            sum_adu += net;
            plane[r * w + c] = net as f32;
        }
    }

    eval_scalar_plane(&plane, w, h, sum_adu, clipped_cnt, span, clip_ceil as f32)
}

fn eval_generic_green_blocks(
    img: &DecodedRawImage,
    x0: usize,
    y0: usize,
    qw: usize,
    qh: usize,
) -> SubplaneResult {
    let bl = img.black_levels[1] as f64;
    let span = (img.white_levels[1] as f64 - bl).max(1.0);
    let clip_ceil = 0.975 * span;

    let mut plane = vec![0.0f32; qw * qh];
    let mut sum_adu = 0.0f64;
    let mut clipped_cnt = 0usize;

    for r in 0..qh {
        for c in 0..qw {
            let mut g_acc = 0.0f64;
            let mut g_n = 0u32;
            for dy in 0..2 {
                for dx in 0..2 {
                    let sx = x0 + c * 2 + dx;
                    let sy = y0 + r * 2 + dy;
                    let ch = img.channel_at_active(sx, sy);
                    if ch == 1 || ch == 2 {
                        let net = (img.active_sample(sx, sy, 0) as f64 - bl).max(0.0);
                        g_acc += net;
                        g_n += 1;
                    }
                }
            }
            let net = if g_n > 0 {
                g_acc / g_n as f64
            } else {
                (img.active_sample(x0 + c * 2, y0 + r * 2, 0) as f64 - bl).max(0.0)
            };
            if net >= clip_ceil {
                clipped_cnt += 1;
            }
            sum_adu += net;
            plane[r * qw + c] = net as f32;
        }
    }

    eval_scalar_plane(&plane, qw, qh, sum_adu, clipped_cnt, span, clip_ceil as f32)
}

fn eval_scalar_plane(
    plane: &[f32],
    w: usize,
    h: usize,
    sum_adu: f64,
    clipped_cnt: usize,
    span: f64,
    clip_ceil: f32,
) -> SubplaneResult {
    let total_px = (w * h).max(1);
    let mean_adu = sum_adu / total_px as f64;
    let mean_norm = (mean_adu / span).clamp(0.0, 1.0);
    let clipped_frac = clipped_cnt as f64 / total_px as f64;

    // 1. Robust local noise floor estimation via strided horizontal/vertical neighbor differences.
    let step_y = (h / 32).max(1);
    let step_x = (w / 32).max(1);
    let mut diffs = Vec::with_capacity(1024);
    let mut samples_bg = Vec::with_capacity(1024);
    for r in (1..h - 1).step_by(step_y) {
        let row = r * w;
        for c in (1..w - 1).step_by(step_x) {
            let v = plane[row + c];
            samples_bg.push(v);
            if v < clip_ceil {
                let dx = (plane[row + c + 1] - v).abs();
                let dy = (plane[row + w + c] - v).abs();
                diffs.push(dx.min(dy));
            }
        }
    }

    let sigma_noise = if !diffs.is_empty() {
        let mid = diffs.len() / 2;
        diffs.select_nth_unstable_by(mid, |a, b| a.total_cmp(b));
        // For |X - Y| with X, Y ~ N(0, sigma^2), median(|X - Y|) = 0.6745 * sqrt(2) * sigma = 0.9539 * sigma.
        (diffs[mid] as f64 / 0.9539).max(0.5)
    } else {
        1.0
    };

    // Expected Sobel Gx^2 + Gy^2 for uncorrelated noise with variance sigma^2 is 24 * sigma^2.
    // Use 4.0x expected noise energy as dead-zone threshold to reject flat-area shot/read noise.
    let noise_energy_thresh = 96.0 * sigma_noise * sigma_noise;

    // 2. Sobel 3x3 Tenengrad energy over interior unclipped stencils + 2x2 quadrant coverage.
    let mut grad_energy_sum = 0.0f64;
    let mut valid_stencils = 0usize;
    let mut edge_pixels = 0usize;
    let mut quad_valid = [0usize; 4];
    let mut quad_edges = [0usize; 4];
    let mid_r = h / 2;
    let mid_c = w / 2;

    for r in 1..h - 1 {
        let r0 = (r - 1) * w;
        let r1 = r * w;
        let r2 = (r + 1) * w;
        let qy = usize::from(r >= mid_r) * 2;
        for c in 1..w - 1 {
            let tl = plane[r0 + c - 1];
            let tc = plane[r0 + c];
            let tr = plane[r0 + c + 1];
            let ml = plane[r1 + c - 1];
            let mc = plane[r1 + c];
            let mr = plane[r1 + c + 1];
            let bl = plane[r2 + c - 1];
            let bc = plane[r2 + c];
            let br = plane[r2 + c + 1];

            // Skip stencils touching hard sensor saturation to avoid artificial clipping edges.
            if mc >= clip_ceil
                || tl >= clip_ceil
                || tr >= clip_ceil
                || bl >= clip_ceil
                || br >= clip_ceil
            {
                continue;
            }

            let q = qy + usize::from(c >= mid_c);
            valid_stencils += 1;
            quad_valid[q] += 1;
            let gx = (tr + 2.0 * mr + br) as f64 - (tl + 2.0 * ml + bl) as f64;
            let gy = (bl + 2.0 * bc + br) as f64 - (tl + 2.0 * tc + tr) as f64;
            let g2 = gx * gx + gy * gy;

            if g2 > noise_energy_thresh {
                grad_energy_sum += g2 - noise_energy_thresh;
                edge_pixels += 1;
                quad_edges[q] += 1;
            }
        }
    }

    let mut blank_quads = 0u8;
    for q in 0..4 {
        if quad_valid[q] >= 8 && (quad_edges[q] as f64 / quad_valid[q] as f64) < 0.003 {
            blank_quads += 1;
        }
    }

    // Guard denominator against near-zero dark patches (floor at 0.5% of dynamic range).
    let mu_guarded = mean_adu.max(0.005 * span);
    let score = if valid_stencils > 16 {
        (grad_energy_sum / (valid_stencils as f64 * mu_guarded * mu_guarded)) * 100.0
    } else {
        0.0
    };
    let edge_density = if valid_stencils > 0 {
        edge_pixels as f64 / valid_stencils as f64
    } else {
        0.0
    };

    // 3. Point-source Star HFR estimation for astrophotography targets.
    let bg_median = if !samples_bg.is_empty() {
        let mid = samples_bg.len() / 2;
        samples_bg.select_nth_unstable_by(mid, |a, b| a.total_cmp(b));
        samples_bg[mid] as f64
    } else {
        mean_adu
    };
    let (star_count, median_hfr_px) =
        estimate_star_hfr(plane, w, h, bg_median as f32, sigma_noise as f32, clip_ceil);

    SubplaneResult {
        score,
        mean_norm,
        edge_density,
        blank_quads,
        clipped_frac,
        star_count,
        median_hfr_px,
    }
}

/// Detect isolated unsaturated point sources and compute their median Half-Flux Radius (in sub-plane pixels).
fn estimate_star_hfr(
    plane: &[f32],
    w: usize,
    h: usize,
    bg: f32,
    sigma: f32,
    clip_ceil: f32,
) -> (u32, Option<f64>) {
    if w < 12 || h < 12 {
        return (0, None);
    }
    // Genuine astrophotography starfields sit on a dark sky background; reject daylight
    // test charts (brick walls, Siemens stars) whose median background exceeds 25% of full well.
    if clip_ceil > 0.0 && bg > 0.25 * clip_ceil {
        return (0, None);
    }
    let peak_thresh = bg + (10.0 * sigma).max(25.0);
    let mut hfrs = Vec::new();
    let rad: isize = 4;

    for r in 5..(h - 5) {
        let row = r * w;
        for c in 5..(w - 5) {
            let center = plane[row + c];
            if center < peak_thresh || center >= clip_ceil {
                continue;
            }
            // Strict local maximum in 5x5 neighborhood, and reject saturated cores touching clip_ceil.
            let mut is_max = true;
            'nbr: for dy in -2isize..=2 {
                for dx in -2isize..=2 {
                    if dx == 0 && dy == 0 {
                        continue;
                    }
                    let nv = plane[((r as isize + dy) as usize) * w + (c as isize + dx) as usize];
                    if (dx.abs() <= 1 && dy.abs() <= 1 && nv >= clip_ceil)
                        || nv > center
                        || (nv == center && (dy < 0 || (dy == 0 && dx < 0)))
                    {
                        is_max = false;
                        break 'nbr;
                    }
                }
            }
            if !is_max {
                continue;
            }

            // Reject extended edges/lines: outer ring should be uniform and close to local background.
            let mut flux_sum = 0.0f64;
            let mut r_flux_sum = 0.0f64;
            let mut outer_sum = 0.0f64;
            let mut outer_sq_sum = 0.0f64;
            let mut outer_cnt = 0u32;

            for dy in -rad..=rad {
                for dx in -rad..=rad {
                    let dist = ((dx * dx + dy * dy) as f64).sqrt();
                    let val = plane[((r as isize + dy) as usize) * w + (c as isize + dx) as usize];
                    if dist >= 3.6 {
                        let vf = val as f64;
                        outer_sum += vf;
                        outer_sq_sum += vf * vf;
                        outer_cnt += 1;
                    }
                }
            }
            let local_bg = if outer_cnt > 0 {
                outer_sum / outer_cnt as f64
            } else {
                bg as f64
            };
            let outer_std = if outer_cnt > 1 {
                let var = (outer_sq_sum / outer_cnt as f64 - local_bg * local_bg).max(0.0);
                var.sqrt()
            } else {
                0.0
            };
            let net_peak = center as f64 - local_bg;
            if net_peak < (8.0 * sigma as f64).max(20.0) {
                continue;
            }
            // If outer ring is elevated far above global bg or has strong periodic texture
            // (brick mortar / Siemens spokes), this is an extended pattern, not an isolated star.
            if (local_bg - bg as f64).abs() > 0.35 * net_peak || outer_std > 0.22 * net_peak {
                continue;
            }

            // Reject single/double hot pixels and Gaussian noise spikes: a genuine optical PSF
            // illuminates multiple immediate 8-connected neighbors (`1 <= dx^2 + dy^2 <= 2`).
            let nbr_thresh = (2.5 * sigma as f64).max(0.04 * net_peak);
            let mut inner_ring_unclipped = 0.0f64;
            let mut active_nbrs = 0u32;
            for dy in -1isize..=1 {
                for dx in -1isize..=1 {
                    if dx == 0 && dy == 0 {
                        continue;
                    }
                    let v = plane[((r as isize + dy) as usize) * w + (c as isize + dx) as usize]
                        as f64
                        - local_bg;
                    inner_ring_unclipped += v;
                    if v >= nbr_thresh {
                        active_nbrs += 1;
                    }
                }
            }
            if active_nbrs < 3 || inner_ring_unclipped < (8.0 * sigma as f64).max(0.22 * net_peak)
            {
                continue;
            }

            let wing_floor = 2.0 * sigma as f64;
            for dy in -rad..=rad {
                for dx in -rad..=rad {
                    let dist = ((dx * dx + dy * dy) as f64).sqrt();
                    if dist <= 4.2 {
                        let val =
                            plane[((r as isize + dy) as usize) * w + (c as isize + dx) as usize]
                                as f64
                                - local_bg;
                        if val > 0.0 && (dist <= 1.5 || val > wing_floor) {
                            flux_sum += val;
                            r_flux_sum += val * dist;
                        }
                    }
                }
            }

            if flux_sum > net_peak * 1.05 {
                let hfr = r_flux_sum / flux_sum;
                if (0.35..3.6).contains(&hfr) {
                    hfrs.push(hfr);
                    if hfrs.len() >= 120 {
                        break;
                    }
                }
            }
        }
        if hfrs.len() >= 120 {
            break;
        }
    }

    if hfrs.len() < 2 {
        return (0, None);
    }
    let count = hfrs.len() as u32;
    let mid = hfrs.len() / 2;
    hfrs.select_nth_unstable_by(mid, |a, b| a.total_cmp(b));
    (count, Some(hfrs[mid]))
}

/// Smoothly attenuate a canonical 5x5 tile's WLS weight when the user relocates its paired
/// 3x3 station away from that tile (e.g., off a foreground obstruction), while keeping full
/// weight (`1.0`) for unmoved stations and all 16 non-station 5x5 tiles so zero-distance or
/// small drags never cause discontinuous `(tx, ty, cr)` jumps.
fn canonical_tile_keep(grid_3x3: &[GridCellMetrics], tile: &GridCellMetrics) -> f64 {
    if tile.row >= 5 || tile.col >= 5 || (tile.row & 1) != 0 || (tile.col & 1) != 0 {
        return 1.0;
    }
    let station_idx = (tile.row / 2) * 3 + (tile.col / 2);
    let Some(station) = grid_3x3.get(station_idx) else {
        return 1.0;
    };
    if !station.norm_x.is_finite()
        || !station.norm_y.is_finite()
        || !tile.norm_x.is_finite()
        || !tile.norm_y.is_finite()
    {
        return 1.0;
    }
    let dx = (station.norm_x - tile.norm_x) as f64;
    let dy = (station.norm_y - tile.norm_y) as f64;
    let dist = dx.hypot(dy);
    const DEADBAND: f64 = 0.015;
    const FADE_END: f64 = 0.12;
    if dist <= DEADBAND {
        1.0
    } else if dist >= FADE_END {
        0.0
    } else {
        let t = (dist - DEADBAND) / (FADE_END - DEADBAND);
        1.0 - t * t * (3.0 - 2.0 * t)
    }
}

/// Center sharpness reference for normalizing the 5x5 grid: uses `grid_5x5[12]` when `MC` is at
/// its canonical center, and smoothly transitions to `grid_3x3[4]` when `MC` is dragged away
/// from the center tile (or falls back to `grid_3x3[4]` if `grid_5x5[12]` is invalid).
fn effective_5x5_center_ref(
    grid_3x3: &[GridCellMetrics],
    grid_5x5: &[GridCellMetrics],
) -> Option<f64> {
    let center_3 = grid_3x3
        .get(4)
        .filter(|c| c.validity == CellValidity::Valid && c.sharpness > 1e-6)
        .map(|c| c.sharpness);
    let center_5_tile = grid_5x5.get(12);
    let center_5 = center_5_tile
        .filter(|c| c.validity == CellValidity::Valid && c.sharpness > 1e-6)
        .map(|c| c.sharpness);
    let mc_keep = center_5_tile
        .map(|tile| canonical_tile_keep(grid_3x3, tile))
        .unwrap_or(1.0);

    match (center_5, center_3) {
        (Some(c5), Some(c3)) => Some(mc_keep * c5 + (1.0 - mc_keep) * c3),
        (Some(c5), None) => Some(c5),
        (None, Some(c3)) => Some(c3),
        (None, None) => None,
    }
}

/// Weighted least-squares fit of normalized sharpness `r(u, v) = c0 + tx * u + ty * v - cr * (u^2 + v^2) / 2`
/// over valid cells in `[-1, 1]^2` to cleanly orthogonalize linear Focal-Plane Tilt `(tx, ty)` from
/// symmetric Radial Field Curvature `cr`.
fn fit_tilt_and_curvature(
    grid_3x3: &[GridCellMetrics],
    grid_5x5: &[GridCellMetrics],
) -> (f64, f64, f64) {
    let mut samples: Vec<(f64, f64, f64, f64)> = Vec::with_capacity(34);

    let center_3 = grid_3x3
        .get(4)
        .filter(|c| c.validity == CellValidity::Valid && c.sharpness > 1e-6)
        .map(|c| c.sharpness);
    if let Some(c3) = center_3 {
        for c in grid_3x3 {
            if c.validity == CellValidity::Valid && c.norm_x.is_finite() && c.norm_y.is_finite() {
                let u = (c.norm_x as f64 - 0.5) * 2.0;
                let v = (c.norm_y as f64 - 0.5) * 2.0;
                let r = (c.sharpness / c3).clamp(0.0, 2.5);
                samples.push((u, v, r, 1.5));
            }
        }
    }

    let center_5_tile = grid_5x5.get(12);
    let center_5 = center_5_tile
        .filter(|c| c.validity == CellValidity::Valid && c.sharpness > 1e-6)
        .map(|c| c.sharpness);
    let mc_keep = center_5_tile
        .map(|tile| canonical_tile_keep(grid_3x3, tile))
        .unwrap_or(1.0);
    let norm_5 = match (center_5, center_3) {
        (Some(c5), Some(c3)) => Some(mc_keep * c5 + (1.0 - mc_keep) * c3),
        (Some(c5), None) if mc_keep > 0.0 => Some(c5),
        (None, Some(c3)) if mc_keep < 1.0 => Some(c3),
        _ => None,
    };
    let valid_5 = grid_5x5
        .iter()
        .filter(|c| c.validity == CellValidity::Valid)
        .count();
    if let Some(c5_ref) = norm_5.filter(|_| valid_5 >= 10) {
        for c in grid_5x5 {
            if c.validity == CellValidity::Valid && c.norm_x.is_finite() && c.norm_y.is_finite() {
                let w = 0.8 * canonical_tile_keep(grid_3x3, c);
                if w > 1e-6 {
                    let u = (c.norm_x as f64 - 0.5) * 2.0;
                    let v = (c.norm_y as f64 - 0.5) * 2.0;
                    let r = (c.sharpness / c5_ref).clamp(0.0, 2.5);
                    samples.push((u, v, r, w));
                }
            }
        }
    }

    if samples.len() < 4 {
        return (0.0, 0.0, 0.0);
    }

    let mut min_u = f64::INFINITY;
    let mut max_u = f64::NEG_INFINITY;
    let mut min_v = f64::INFINITY;
    let mut max_v = f64::NEG_INFINITY;
    let mut min_q = f64::INFINITY;
    let mut max_q = f64::NEG_INFINITY;

    // Normal equations A^T W A beta = A^T W y for basis [1, u, v, (u^2 + v^2)/2].
    let mut ata = [[0.0f64; 4]; 4];
    let mut aty = [0.0f64; 4];

    for &(u, v, y, w) in &samples {
        let q = 0.5 * (u * u + v * v);
        min_u = min_u.min(u);
        max_u = max_u.max(u);
        min_v = min_v.min(v);
        max_v = max_v.max(v);
        min_q = min_q.min(q);
        max_q = max_q.max(q);

        let basis = [1.0, u, v, q];
        for i in 0..4 {
            aty[i] += w * basis[i] * y;
            for j in 0..4 {
                ata[i][j] += w * basis[i] * basis[j];
            }
        }
    }

    // Do NOT penalize the constant intercept `beta[0]` (which previously leaked intercept into
    // `tx`/`ty` when valid stations were collinear on a single horizon row/col!).
    ata[0][0] += 1e-12;
    ata[1][1] += if max_u - min_u < 0.25 { 1e6 } else { 1e-3 };
    ata[2][2] += if max_v - min_v < 0.25 { 1e6 } else { 1e-3 };
    ata[3][3] += if max_q - min_q < 0.10 { 1e6 } else { 1e-3 };

    if let Some(beta) = solve_4x4(ata, aty) {
        let tx = beta[1];
        let ty = beta[2];
        // Positive `radial_falloff` means sharpness decreases from center toward corners.
        let radial_falloff = -beta[3];
        if tx.is_finite() && ty.is_finite() && radial_falloff.is_finite() {
            (tx, ty, radial_falloff)
        } else {
            (0.0, 0.0, 0.0)
        }
    } else {
        (0.0, 0.0, 0.0)
    }
}

fn solve_4x4(mut a: [[f64; 4]; 4], mut b: [f64; 4]) -> Option<[f64; 4]> {
    for col in 0..4 {
        let mut pivot = col;
        let mut max_v = a[col][col].abs();
        for (r, row) in a.iter().enumerate().skip(col + 1) {
            if row[col].abs() > max_v {
                max_v = row[col].abs();
                pivot = r;
            }
        }
        if !max_v.is_finite() || max_v < 1e-10 {
            return None;
        }
        if pivot != col {
            a.swap(col, pivot);
            b.swap(col, pivot);
        }
        let diag = a[col][col];
        for item in a[col].iter_mut().skip(col) {
            *item /= diag;
        }
        b[col] /= diag;

        let pivot_row = a[col];
        let pivot_b = b[col];
        for r in 0..4 {
            if r != col {
                let factor = a[r][col];
                for (dst, &piv) in a[r].iter_mut().zip(pivot_row.iter()).skip(col) {
                    *dst -= factor * piv;
                }
                b[r] -= factor * pivot_b;
            }
        }
    }
    if b.iter().all(|v| v.is_finite()) {
        Some(b)
    } else {
        None
    }
}

fn normalize_deg(deg: f64) -> f64 {
    if !deg.is_finite() {
        return 0.0;
    }
    let mut wrapped = (deg + 180.0).rem_euclid(360.0) - 180.0;
    if wrapped <= -180.0 {
        wrapped += 360.0;
    }
    wrapped
}

fn direction_label(angle_deg: f64, mag: f64) -> String {
    if mag < 0.04 {
        return "Centered".to_string();
    }
    // 0° = Right, 45° = Bottom-Right, 90° = Bottom, 135° = Bottom-Left,
    // 180/-180° = Left, -135° = Top-Left, -90° = Top, -45° = Top-Right
    let sector = ((angle_deg + 202.5) / 45.0).floor() as i32;
    match sector.rem_euclid(8) {
        0 => "Left (ML)",
        1 => "Top-Left (TL)",
        2 => "Top (TC)",
        3 => "Top-Right (TR)",
        4 => "Right (MR)",
        5 => "Bottom-Right (BR)",
        6 => "Bottom (BC)",
        _ => "Bottom-Left (BL)",
    }
    .to_string()
}
