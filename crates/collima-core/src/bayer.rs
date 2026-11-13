//! Bayer CFA channel separation, 2x2 superpixel binning overview renderer,
//! and 1:1 full-sensor-resolution loupe patch renderer.

use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

use crate::decoder::{DecodedRawImage, MosaicKind};

/// Explicit separated Bayer 4-channel planes (`width = active_width / 2`, `height = active_height / 2`).
/// Useful for deterministic unit tests and direct plane export.
#[derive(Debug, Clone)]
pub struct BayerPlanes {
    pub plane_width: usize,
    pub plane_height: usize,
    pub r: Vec<u16>,
    pub g1: Vec<u16>,
    pub g2: Vec<u16>,
    pub b: Vec<u16>,
}

/// Inspection rendering mode for 1:1 full-resolution patches in the 9-grid loupe.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PatchRenderMode {
    /// Edge-directed 1:1 demosaic with white balance & Camera->sRGB color matrix.
    DemosaicSrgb = 0,
    /// Pure pre-demosaic Green channel luminance (immune to lateral chromatic aberration).
    GreenLuminance = 1,
    /// Un-interpolated 1:1 raw Bayer CFA photosite mosaic.
    BayerMosaic = 2,
}

impl PatchRenderMode {
    pub fn from_u8(v: u8) -> Self {
        match v {
            1 => Self::GreenLuminance,
            2 => Self::BayerMosaic,
            _ => Self::DemosaicSrgb,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageBufferDesc {
    pub width: u32,
    pub height: u32,
    /// Top-left X in active-area sensor coordinates.
    pub sensor_x: u32,
    /// Top-left Y in active-area sensor coordinates.
    pub sensor_y: u32,
    /// Sensor pixels per output pixel (`2.0` for 2x2 binned overview, `1.0` for 1:1 patch).
    pub sensor_px_per_out_px: f32,
}

pub struct RenderedRgba {
    pub desc: ImageBufferDesc,
    pub rgba: Vec<u8>,
}

/// Split a 2x2 Bayer `DecodedRawImage` into four independent `(active_w/2) x (active_h/2)` planes
/// without interpolation.
pub fn split_bayer_planes(img: &DecodedRawImage) -> Option<BayerPlanes> {
    let bo = img.bayer_offsets?;
    let [ax, ay, aw, ah] = img.active_rect;
    let pw = aw / 2;
    let ph = ah / 2;
    let len = pw * ph;

    let mut r = Vec::with_capacity(len);
    let mut g1 = Vec::with_capacity(len);
    let mut g2 = Vec::with_capacity(len);
    let mut b = Vec::with_capacity(len);

    for qy in 0..ph {
        let base_y = ay + qy * 2;
        for qx in 0..pw {
            let base_x = ax + qx * 2;
            r.push(img.pixels[(base_y + bo.r.1) * img.stride + (base_x + bo.r.0)]);
            g1.push(img.pixels[(base_y + bo.g1.1) * img.stride + (base_x + bo.g1.0)]);
            g2.push(img.pixels[(base_y + bo.g2.1) * img.stride + (base_x + bo.g2.0)]);
            b.push(img.pixels[(base_y + bo.b.1) * img.stride + (base_x + bo.b.0)]);
        }
    }

    Some(BayerPlanes {
        plane_width: pw,
        plane_height: ph,
        r,
        g1,
        g2,
        b,
    })
}

const SRGB_LUT_SIZE: usize = 4096;

fn srgb_lut() -> &'static [u8; SRGB_LUT_SIZE + 1] {
    static LUT: OnceLock<[u8; SRGB_LUT_SIZE + 1]> = OnceLock::new();
    LUT.get_or_init(|| {
        let mut table = [0u8; SRGB_LUT_SIZE + 1];
        for (i, slot) in table.iter_mut().enumerate() {
            let x = i as f32 / SRGB_LUT_SIZE as f32;
            // Soft highlight shoulder above 0.85 so specular edges remain legible.
            let mapped = if x <= 0.85 {
                x
            } else {
                0.85 + 0.15 * ((x - 0.85) / (0.15 + (x - 0.85)))
            };
            let gamma = if mapped <= 0.003_130_8 {
                12.92 * mapped
            } else {
                1.055 * mapped.powf(1.0 / 2.4) - 0.055
            };
            *slot = (gamma.clamp(0.0, 1.0) * 255.0 + 0.5) as u8;
        }
        table
    })
}

#[inline]
fn linear_to_srgb_u8(v: f32, lut: &[u8; SRGB_LUT_SIZE + 1]) -> u8 {
    let clamped = v.clamp(0.0, 1.0);
    let idx = (clamped * SRGB_LUT_SIZE as f32 + 0.5) as usize;
    lut[idx.min(SRGB_LUT_SIZE)]
}

#[inline]
fn normalize_sample(raw: f32, black: f32, inv_span: f32) -> f32 {
    ((raw - black) * inv_span).max(0.0)
}

#[inline]
fn cam_rgb_to_srgb8(
    r_lin: f32,
    g_lin: f32,
    b_lin: f32,
    wb: &[f32; 3],
    mat: &[[f32; 3]; 3],
    gain: f32,
    lut: &[u8; SRGB_LUT_SIZE + 1],
) -> [u8; 4] {
    let rw = r_lin * wb[0] * gain;
    let gw = g_lin * wb[1] * gain;
    let bw = b_lin * wb[2] * gain;

    let sr = mat[0][0] * rw + mat[0][1] * gw + mat[0][2] * bw;
    let sg = mat[1][0] * rw + mat[1][1] * gw + mat[1][2] * bw;
    let sb = mat[2][0] * rw + mat[2][1] * gw + mat[2][2] * bw;

    [
        linear_to_srgb_u8(sr, lut),
        linear_to_srgb_u8(sg, lut),
        linear_to_srgb_u8(sb, lut),
        255,
    ]
}

/// Generate a lightweight RGBA8 overview image via 2x2 Bayer binning (plus integer decimation
/// if half-resolution exceeds `max_dim`, keeping Canvas well below browser GPU texture limits).
pub fn render_overview_rgba(img: &DecodedRawImage, max_dim: u32, ev_boost: f32) -> RenderedRgba {
    let [ax, ay, aw, ah] = img.active_rect;
    let half_w = (aw / 2).max(1);
    let half_h = (ah / 2).max(1);
    let max_d = max_dim.max(256) as usize;

    let quad_step = ((half_w.max(half_h) + max_d - 1) / max_d).max(1);
    let out_w = (half_w / quad_step).max(1);
    let out_h = (half_h / quad_step).max(1);

    let lut = srgb_lut();
    let gain = 2.0f32.powf(ev_boost.clamp(-6.0, 10.0));
    let inv_spans = [
        1.0 / (img.white_levels[0] - img.black_levels[0]).max(1.0),
        1.0 / (img.white_levels[1] - img.black_levels[1]).max(1.0),
        1.0 / (img.white_levels[2] - img.black_levels[2]).max(1.0),
        1.0 / (img.white_levels[3] - img.black_levels[3]).max(1.0),
    ];

    let mut rgba = vec![0u8; out_w * out_h * 4];

    match img.meta.mosaic_kind {
        MosaicKind::Bayer2x2 => {
            let bo = img.bayer_offsets.expect("Bayer2x2 has offsets");
            for oy in 0..out_h {
                let qy = oy * quad_step;
                let sy = ay + qy * 2;
                let row_out = oy * out_w * 4;
                for ox in 0..out_w {
                    let qx = ox * quad_step;
                    let sx = ax + qx * 2;

                    let r_raw = img.pixels[(sy + bo.r.1) * img.stride + (sx + bo.r.0)] as f32;
                    let g1_raw = img.pixels[(sy + bo.g1.1) * img.stride + (sx + bo.g1.0)] as f32;
                    let g2_raw = img.pixels[(sy + bo.g2.1) * img.stride + (sx + bo.g2.0)] as f32;
                    let b_raw = img.pixels[(sy + bo.b.1) * img.stride + (sx + bo.b.0)] as f32;

                    let r_lin = normalize_sample(r_raw, img.black_levels[0], inv_spans[0]);
                    let g_lin = 0.5
                        * (normalize_sample(g1_raw, img.black_levels[1], inv_spans[1])
                            + normalize_sample(g2_raw, img.black_levels[2], inv_spans[2]));
                    let b_lin = normalize_sample(b_raw, img.black_levels[3], inv_spans[3]);

                    let px = cam_rgb_to_srgb8(
                        r_lin,
                        g_lin,
                        b_lin,
                        &img.wb_rgb,
                        &img.cam_wb_to_srgb,
                        gain,
                        lut,
                    );
                    let dst = row_out + ox * 4;
                    rgba[dst..dst + 4].copy_from_slice(&px);
                }
            }
        }
        MosaicKind::LinearRgb => {
            let px_step = quad_step * 2;
            for oy in 0..out_h {
                let sy = (ay + oy * px_step).min(ay + ah - 1);
                let row_out = oy * out_w * 4;
                for ox in 0..out_w {
                    let sx = (ax + ox * px_step).min(ax + aw - 1);
                    let base = (sy * img.stride + sx) * img.cpp;
                    let r_lin =
                        normalize_sample(img.pixels[base] as f32, img.black_levels[0], inv_spans[0]);
                    let g_lin = normalize_sample(
                        img.pixels[base + 1] as f32,
                        img.black_levels[1],
                        inv_spans[1],
                    );
                    let b_lin = normalize_sample(
                        img.pixels[base + 2] as f32,
                        img.black_levels[3],
                        inv_spans[3],
                    );
                    let px = cam_rgb_to_srgb8(
                        r_lin,
                        g_lin,
                        b_lin,
                        &img.wb_rgb,
                        &img.cam_wb_to_srgb,
                        gain,
                        lut,
                    );
                    let dst = row_out + ox * 4;
                    rgba[dst..dst + 4].copy_from_slice(&px);
                }
            }
        }
        MosaicKind::XTrans6x6 | MosaicKind::OtherSinglePlane => {
            let px_step = quad_step * 2;
            for oy in 0..out_h {
                let y0 = oy * px_step;
                let row_out = oy * out_w * 4;
                for ox in 0..out_w {
                    let x0 = ox * px_step;
                    let mut sum = [0.0f32; 3];
                    let mut cnt = [0u32; 3];
                    for dy in 0..3 {
                        let y = (y0 + dy).min(ah - 1);
                        for dx in 0..3 {
                            let x = (x0 + dx).min(aw - 1);
                            let ch = img.channel_at_active(x, y);
                            let v = normalize_sample(
                                img.active_sample(x, y, 0) as f32,
                                img.black_levels[ch],
                                inv_spans[ch],
                            );
                            let rgb_idx = match ch {
                                0 => 0,
                                3 => 2,
                                _ => 1,
                            };
                            sum[rgb_idx] += v;
                            cnt[rgb_idx] += 1;
                        }
                    }
                    let g = if cnt[1] > 0 {
                        sum[1] / cnt[1] as f32
                    } else {
                        0.0
                    };
                    let r = if cnt[0] > 0 { sum[0] / cnt[0] as f32 } else { g };
                    let b = if cnt[2] > 0 { sum[2] / cnt[2] as f32 } else { g };
                    let px =
                        cam_rgb_to_srgb8(r, g, b, &img.wb_rgb, &img.cam_wb_to_srgb, gain, lut);
                    let dst = row_out + ox * 4;
                    rgba[dst..dst + 4].copy_from_slice(&px);
                }
            }
        }
    }

    RenderedRgba {
        desc: ImageBufferDesc {
            width: out_w as u32,
            height: out_h as u32,
            sensor_x: 0,
            sensor_y: 0,
            sensor_px_per_out_px: (quad_step * 2) as f32,
        },
        rgba,
    }
}

/// Render a 1:1 full-sensor-resolution patch centered at normalized active-area coordinates
/// `(norm_x, norm_y) in [0.0, 1.0]^2` for pixel-accurate 100% / 200% / 400% loupe inspection.
pub fn render_patch_rgba(
    img: &DecodedRawImage,
    norm_x: f32,
    norm_y: f32,
    patch_w: u32,
    patch_h: u32,
    mode: PatchRenderMode,
    ev_boost: f32,
) -> RenderedRgba {
    let [_, _, aw, ah] = img.active_rect;
    let pw = (patch_w.clamp(32, 1024) as usize).min(aw);
    let ph = (patch_h.clamp(32, 1024) as usize).min(ah);

    let cx = (norm_x.clamp(0.0, 1.0) * aw as f32).round() as isize;
    let cy = (norm_y.clamp(0.0, 1.0) * ah as f32).round() as isize;

    let x0 = (cx - (pw as isize / 2)).clamp(0, (aw - pw) as isize) as usize;
    let y0 = (cy - (ph as isize / 2)).clamp(0, (ah - ph) as isize) as usize;

    let lut = srgb_lut();
    let gain = 2.0f32.powf(ev_boost.clamp(-6.0, 10.0));
    let inv_spans = [
        1.0 / (img.white_levels[0] - img.black_levels[0]).max(1.0),
        1.0 / (img.white_levels[1] - img.black_levels[1]).max(1.0),
        1.0 / (img.white_levels[2] - img.black_levels[2]).max(1.0),
        1.0 / (img.white_levels[3] - img.black_levels[3]).max(1.0),
    ];

    let sample_norm = |x: isize, y: isize| -> f32 {
        let sx = x.clamp(0, (aw - 1) as isize) as usize;
        let sy = y.clamp(0, (ah - 1) as isize) as usize;
        let ch = img.channel_at_active(sx, sy);
        let raw = img.active_sample(sx, sy, 0) as f32;
        normalize_sample(raw, img.black_levels[ch], inv_spans[ch])
    };

    let mut rgba = vec![0u8; pw * ph * 4];

    if img.meta.mosaic_kind == MosaicKind::LinearRgb {
        for py in 0..ph {
            let sy = y0 + py;
            for px in 0..pw {
                let sx = x0 + px;
                let r = normalize_sample(
                    img.active_sample(sx, sy, 0) as f32,
                    img.black_levels[0],
                    inv_spans[0],
                );
                let g = normalize_sample(
                    img.active_sample(sx, sy, 1) as f32,
                    img.black_levels[1],
                    inv_spans[1],
                );
                let b = normalize_sample(
                    img.active_sample(sx, sy, 2) as f32,
                    img.black_levels[3],
                    inv_spans[3],
                );
                let out = match mode {
                    PatchRenderMode::GreenLuminance => {
                        let gl = linear_to_srgb_u8(g * gain, lut);
                        [gl, gl, gl, 255]
                    }
                    _ => cam_rgb_to_srgb8(r, g, b, &img.wb_rgb, &img.cam_wb_to_srgb, gain, lut),
                };
                let dst = (py * pw + px) * 4;
                rgba[dst..dst + 4].copy_from_slice(&out);
            }
        }
    } else {
        for py in 0..ph {
            let sy = (y0 + py) as isize;
            for px in 0..pw {
                let sx = (x0 + px) as isize;
                let ch = img.channel_at_active(sx as usize, sy as usize);
                let c0 = sample_norm(sx, sy);
                let dst = (py * pw + px) * 4;

                match mode {
                    PatchRenderMode::BayerMosaic => {
                        let v = linear_to_srgb_u8(c0 * gain, lut);
                        let out = match ch {
                            0 => [v, v / 5, v / 5, 255],
                            3 => [v / 5, v / 4, v, 255],
                            _ => [v / 5, v, v / 5, 255],
                        };
                        rgba[dst..dst + 4].copy_from_slice(&out);
                    }
                    PatchRenderMode::GreenLuminance => {
                        // Exact Green at G1/G2 sites; directional gradient-weighted Green at R/B sites.
                        let g = if ch == 1 || ch == 2 {
                            c0
                        } else {
                            let gn = sample_norm(sx, sy - 1);
                            let gs = sample_norm(sx, sy + 1);
                            let gw = sample_norm(sx - 1, sy);
                            let ge = sample_norm(sx + 1, sy);
                            let grad_v = (gn - gs).abs();
                            let grad_h = (gw - ge).abs();
                            if grad_h + 1e-5 < grad_v {
                                0.5 * (gw + ge)
                            } else if grad_v + 1e-5 < grad_h {
                                0.5 * (gn + gs)
                            } else {
                                0.25 * (gn + gs + gw + ge)
                            }
                        };
                        let v = linear_to_srgb_u8(g * gain, lut);
                        rgba[dst..dst + 4].copy_from_slice(&[v, v, v, 255]);
                    }
                    PatchRenderMode::DemosaicSrgb => {
                        let (r, g, b) = if img.meta.mosaic_kind == MosaicKind::Bayer2x2 {
                            demosaic_bayer_pixel(img, sx, sy, &sample_norm)
                        } else {
                            // Local 3x3 neighborhood fallback for X-Trans / non-Bayer.
                            let mut sum = [0.0f32; 3];
                            let mut cnt = [0u32; 3];
                            for dy in -1..=1 {
                                for dx in -1..=1 {
                                    let nx = (sx + dx).clamp(0, (aw - 1) as isize) as usize;
                                    let ny = (sy + dy).clamp(0, (ah - 1) as isize) as usize;
                                    let nch = img.channel_at_active(nx, ny);
                                    let nv = sample_norm(sx + dx, sy + dy);
                                    let idx = match nch {
                                        0 => 0,
                                        3 => 2,
                                        _ => 1,
                                    };
                                    sum[idx] += nv;
                                    cnt[idx] += 1;
                                }
                            }
                            let gv = if cnt[1] > 0 { sum[1] / cnt[1] as f32 } else { c0 };
                            let rv = if cnt[0] > 0 { sum[0] / cnt[0] as f32 } else { gv };
                            let bv = if cnt[2] > 0 { sum[2] / cnt[2] as f32 } else { gv };
                            (rv, gv, bv)
                        };

                        let out =
                            cam_rgb_to_srgb8(r, g, b, &img.wb_rgb, &img.cam_wb_to_srgb, gain, lut);
                        rgba[dst..dst + 4].copy_from_slice(&out);
                    }
                }
            }
        }
    }

    RenderedRgba {
        desc: ImageBufferDesc {
            width: pw as u32,
            height: ph as u32,
            sensor_x: x0 as u32,
            sensor_y: y0 as u32,
            sensor_px_per_out_px: 1.0,
        },
        rgba,
    }
}

/// Edge-directed PPG/color-difference Bayer demosaicing at a single 1:1 pixel `(sx, sy)`.
#[inline]
fn demosaic_bayer_pixel<F>(img: &DecodedRawImage, sx: isize, sy: isize, s: &F) -> (f32, f32, f32)
where
    F: Fn(isize, isize) -> f32,
{
    let ch = img.channel_at_active(sx as usize, sy as usize);
    let c = s(sx, sy);

    let g_interp = |x: isize, y: isize| -> f32 {
        let gn = s(x, y - 1);
        let gs = s(x, y + 1);
        let gw = s(x - 1, y);
        let ge = s(x + 1, y);
        let c_here = s(x, y);
        let grad_v = (gn - gs).abs() + (2.0 * c_here - s(x, y - 2) - s(x, y + 2)).abs() * 0.5;
        let grad_h = (gw - ge).abs() + (2.0 * c_here - s(x - 2, y) - s(x + 2, y)).abs() * 0.5;
        if grad_h + 1e-5 < grad_v {
            (0.5 * (gw + ge) + 0.25 * (2.0 * c_here - s(x - 2, y) - s(x + 2, y))).max(0.0)
        } else if grad_v + 1e-5 < grad_h {
            (0.5 * (gn + gs) + 0.25 * (2.0 * c_here - s(x, y - 2) - s(x, y + 2))).max(0.0)
        } else {
            0.25 * (gn + gs + gw + ge)
        }
    };

    match ch {
        0 => {
            // Red site: R known, G edge-directed, B from 4 diagonal neighbors via color difference.
            let g = g_interp(sx, sy);
            let b_diag = 0.25
                * ((s(sx - 1, sy - 1) - g_interp(sx - 1, sy - 1))
                    + (s(sx + 1, sy - 1) - g_interp(sx + 1, sy - 1))
                    + (s(sx - 1, sy + 1) - g_interp(sx - 1, sy + 1))
                    + (s(sx + 1, sy + 1) - g_interp(sx + 1, sy + 1)))
                + g;
            (c, g, b_diag.max(0.0))
        }
        3 => {
            // Blue site: B known, G edge-directed, R from 4 diagonal neighbors via color difference.
            let g = g_interp(sx, sy);
            let r_diag = 0.25
                * ((s(sx - 1, sy - 1) - g_interp(sx - 1, sy - 1))
                    + (s(sx + 1, sy - 1) - g_interp(sx + 1, sy - 1))
                    + (s(sx - 1, sy + 1) - g_interp(sx - 1, sy + 1))
                    + (s(sx + 1, sy + 1) - g_interp(sx + 1, sy + 1)))
                + g;
            (r_diag.max(0.0), g, c)
        }
        1 => {
            // G1 (Green on Red row): R is horizontal neighbor, B is vertical neighbor.
            let r_h = 0.5
                * ((s(sx - 1, sy) - g_interp(sx - 1, sy))
                    + (s(sx + 1, sy) - g_interp(sx + 1, sy)))
                + c;
            let b_v = 0.5
                * ((s(sx, sy - 1) - g_interp(sx, sy - 1))
                    + (s(sx, sy + 1) - g_interp(sx, sy + 1)))
                + c;
            (r_h.max(0.0), c, b_v.max(0.0))
        }
        _ => {
            // G2 (Green on Blue row): B is horizontal neighbor, R is vertical neighbor.
            let b_h = 0.5
                * ((s(sx - 1, sy) - g_interp(sx - 1, sy))
                    + (s(sx + 1, sy) - g_interp(sx + 1, sy)))
                + c;
            let r_v = 0.5
                * ((s(sx, sy - 1) - g_interp(sx, sy - 1))
                    + (s(sx, sy + 1) - g_interp(sx, sy + 1)))
                + c;
            (r_v.max(0.0), c, b_h.max(0.0))
        }
    }
}
