//! Pure in-memory dual-engine RAW decoding & sensor calibration metadata extraction.
//!
//! Combines:
//! 1. `ticoraw` for Nikon High Efficiency (`HE` / `HE*`) `.NEF` codestreams (intoPIX TicoRAW /
//!    N-RAW JPEG XS wavelet compression on Z9, Z8, Zf, Z6III, Z5II, Z50II, ZR).
//! 2. `flashraw` for ~40 RAW formats including Sony `X-OCN / LLVC3` (`ARW 6.0` Compressed /
//!    Compressed HQ 5/3 wavelet codec on α7 V / α7R VI), Sony Lossless ARW, Canon `CR3` (CRX +
//!    C-RAW) & `CR2`, classic Nikon `NEF`, `DNG` (incl. JPEG XL DNG 1.7), Fujifilm `RAF`,
//!    Panasonic/Leica `RW2`/`RWL`, Olympus `ORF`, and Pentax `PEF`.

use flashraw::{
    Backend, CfaColor, CorruptionPolicy, DecodeOptions, FlashRaw, FrameSource, OutputFormat,
    SensorLayout,
};
use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Canonical 4-channel indices for Bayer sensor analysis:
/// `[0 = R, 1 = G1 (Green on Red row), 2 = G2 (Green on Blue row), 3 = B]`.
pub const CHANNEL_NAMES: [&str; 4] = ["R", "G1", "G2", "B"];

#[derive(Debug, Error)]
pub enum CollimaError {
    #[error("Empty or truncated RAW buffer ({0} bytes)")]
    EmptyBuffer(usize),
    #[error("Nikon High Efficiency (TicoRAW) decode failed: {0}")]
    TicoDecode(String),
    #[error("RAW decode failed: {0}")]
    RawDecode(String),
    #[error("Unsupported pixel storage format (expected 16-bit integer or float sensor samples)")]
    UnsupportedPixelData,
    #[error("Invalid active sensor area ({width}x{height})")]
    InvalidActiveArea { width: u32, height: u32 },
}

/// Sensor mosaic topology of the decoded buffer.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MosaicKind {
    /// Standard 2x2 Bayer CFA (`RGGB`, `BGGR`, `GRBG`, `GBRG`).
    Bayer2x2,
    /// Fujifilm 6x6 X-Trans CFA.
    XTrans6x6,
    /// Other single-plane CFA or monochrome sensor.
    OtherSinglePlane,
    /// Pre-demosaiced / linear RGB (`cpp >= 3`, e.g. sRAW, Linear DNG, Sony Lossless M/S YCbCr).
    LinearRgb,
}

/// Offsets `(dx, dy)` within each 2x2 superpixel of the cropped `active_area`
/// for canonical `[R, G1, G2, B]` channels.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct BayerQuadOffsets {
    pub r: (usize, usize),
    pub g1: (usize, usize),
    pub g2: (usize, usize),
    pub b: (usize, usize),
    /// Human-readable 2x2 CFA string at active_area origin, e.g. `"RGGB"`.
    pub pattern_name: [char; 4],
}

impl BayerQuadOffsets {
    pub fn from_red_offset(rx: usize, ry: usize) -> Self {
        let r = (rx, ry);
        let g1 = (1 - rx, ry);
        let g2 = (rx, 1 - ry);
        let b = (1 - rx, 1 - ry);
        let mut grid = [['G'; 2]; 2];
        grid[r.1][r.0] = 'R';
        grid[b.1][b.0] = 'B';
        Self {
            r,
            g1,
            g2,
            b,
            pattern_name: [grid[0][0], grid[0][1], grid[1][0], grid[1][1]],
        }
    }

    #[inline]
    pub fn offset_for_channel(&self, ch: usize) -> (usize, usize) {
        match ch {
            0 => self.r,
            1 => self.g1,
            2 => self.g2,
            _ => self.b,
        }
    }

    pub fn pattern_string(&self) -> String {
        self.pattern_name.iter().collect()
    }
}

/// Serializable EXIF, optical, and sensor metadata returned to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawImageMetadata {
    pub make: String,
    pub model: String,
    pub camera_label: String,
    pub lens_make: Option<String>,
    pub lens_model: Option<String>,
    pub iso: Option<u32>,
    pub exposure_time_sec: Option<f64>,
    pub shutter_display: Option<String>,
    pub f_number: Option<f32>,
    pub focal_length_mm: Option<f32>,
    pub capture_time: Option<String>,
    pub raw_width: u32,
    pub raw_height: u32,
    pub active_x: u32,
    pub active_y: u32,
    pub active_width: u32,
    pub active_height: u32,
    pub bits_per_sample: u8,
    pub cfa_pattern: String,
    pub mosaic_kind: MosaicKind,
    pub black_levels: [f32; 4],
    pub white_levels: [f32; 4],
    pub wb_multipliers: [f32; 3],
    pub orientation_exif: u32,
    pub format_name: String,
    pub compression_name: String,
    pub decoder_engine: String,
    pub decode_ms: f64,
    pub warnings: Vec<String>,
}

/// In-memory decoded RAW image held inside `RawSession` (or analyzed transiently in batch mode).
pub struct DecodedRawImage {
    pub meta: RawImageMetadata,
    /// Full decoded buffer width (stride in pixels).
    pub stride: usize,
    /// Full decoded buffer height.
    pub buffer_height: usize,
    /// Components per pixel (`1` for Bayer/CFA, `3` for LinearRGB).
    pub cpp: usize,
    /// Unmodified 16-bit sensor samples (`buffer_height * stride * cpp`).
    pub pixels: Vec<u16>,
    /// Active sensor area `(x, y, width, height)` in `pixels` coordinates.
    pub active_rect: [usize; 4],
    /// Canonical 2x2 Bayer offsets inside `active_rect` when `mosaic_kind == MosaicKind::Bayer2x2`.
    pub bayer_offsets: Option<BayerQuadOffsets>,
    /// Full CFA pattern for X-Trans / non-Bayer fallback (`(width, height, row_major_rgb_codes)`).
    pub generic_cfa: Option<(usize, usize, Vec<u8>)>,
    /// Per-channel black levels `[R, G1, G2, B]`.
    pub black_levels: [f32; 4],
    /// Per-channel white levels `[R, G1, G2, B]`.
    pub white_levels: [f32; 4],
    /// White-balance multipliers `[R, G, B]` (with G normalized to `1.0`).
    pub wb_rgb: [f32; 3],
    /// Row-normalized inverted 3x3 matrix mapping white-balanced Camera RGB -> linear sRGB (D65).
    pub cam_wb_to_srgb: [[f32; 3]; 3],
}

impl DecodedRawImage {
    /// Sample raw `u16` pixel at `(ax + x, ay + y)` within the active area.
    #[inline]
    pub fn active_sample(&self, x: usize, y: usize, c: usize) -> u16 {
        let bx = self.active_rect[0] + x;
        let by = self.active_rect[1] + y;
        let idx = (by * self.stride + bx) * self.cpp + c;
        self.pixels[idx]
    }

    /// Determine canonical channel index `0=R, 1=G1, 2=G2, 3=B` at active-area coordinates `(x, y)`.
    #[inline]
    pub fn channel_at_active(&self, x: usize, y: usize) -> usize {
        if let Some(bo) = &self.bayer_offsets {
            let parity = (x & 1, y & 1);
            if parity == bo.r {
                0
            } else if parity == bo.g1 {
                1
            } else if parity == bo.g2 {
                2
            } else {
                3
            }
        } else if let Some((cw, ch, table)) = &self.generic_cfa {
            let bx = self.active_rect[0] + x;
            let by = self.active_rect[1] + y;
            let code = table[(by % *ch) * *cw + (bx % *cw)];
            match code {
                0 => 0,
                1 => {
                    if (y & 1) == 0 {
                        1
                    } else {
                        2
                    }
                }
                2 => 3,
                _ => 1,
            }
        } else {
            1
        }
    }
}

/// Safely probe whether an in-memory buffer is a Nikon High Efficiency (`HE` / `HE*`) `.NEF`
/// codestream without panicking on truncated, unaligned, big/little-endian, or cyclic TIFF IFDs.
pub fn is_nikon_he_nef(bytes: &[u8]) -> bool {
    matches!(validate_tiff_ifd_structure(bytes), Some(true))
}

/// Non-panicking bounds-checked and cycle-checked TIFF (`II` / `MM`) IFD + SubIFD walker.
/// Returns `None` if the TIFF header/IFD graph is truncated or cyclic; otherwise returns
/// `Some(is_nikon_he)` indicating whether `Make` starts with `"NIKON"` and any IFD/SubIFD carries
/// Nikon HE / TicoRAW (`Compression == 52546` or JPEG XS strip magic `FF 10 FF 50`).
fn validate_tiff_ifd_structure(bytes: &[u8]) -> Option<bool> {
    if bytes.len() < 16 {
        return None;
    }
    let le = match &bytes[0..2] {
        b"II" => true,
        b"MM" => false,
        _ => return None,
    };
    let read_u16 = |off: usize| -> Option<u16> {
        let s = bytes.get(off..off.checked_add(2)?)?;
        let arr = [s[0], s[1]];
        Some(if le {
            u16::from_le_bytes(arr)
        } else {
            u16::from_be_bytes(arr)
        })
    };
    let read_u32 = |off: usize| -> Option<u32> {
        let s = bytes.get(off..off.checked_add(4)?)?;
        let arr = [s[0], s[1], s[2], s[3]];
        Some(if le {
            u32::from_le_bytes(arr)
        } else {
            u32::from_be_bytes(arr)
        })
    };
    let read_scalar_u32 = |ty: u16, cnt: usize, val_off: usize| -> Option<u32> {
        if cnt != 1 {
            return None;
        }
        match ty {
            3 => read_u16(val_off).map(u32::from),
            4 | 13 => read_u32(val_off),
            _ => None,
        }
    };

    if read_u16(2) != Some(42) {
        return None;
    }
    let first_ifd = match read_u32(4) {
        Some(off) if (off as usize) >= 8 && (off as usize) < bytes.len() => off,
        _ => return None,
    };

    let mut is_nikon = false;
    let mut has_tico_marker = false;

    // Bounded stack over IFD chain + SubIFD (0x014A) + ExifIFD (0x8769) pointers with cycle guard.
    let mut visited = [0u32; 64];
    let mut visited_len = 0usize;
    let mut stack = [0u32; 64];
    stack[0] = first_ifd;
    let mut stack_len = 1usize;

    while stack_len > 0 {
        stack_len -= 1;
        let ifd_off = stack[stack_len];
        if ifd_off == 0 {
            continue;
        }
        // Reject cyclic IFD / SubIFD pointers!
        if visited[..visited_len].contains(&ifd_off) {
            return None;
        }
        if visited_len >= visited.len() {
            break;
        }
        visited[visited_len] = ifd_off;
        visited_len += 1;

        let base = ifd_off as usize;
        let entry_count = read_u16(base)? as usize;
        if entry_count > 4096 {
            return None;
        }
        let entries_bytes = entry_count.checked_mul(12)?;
        let next_ptr_pos = base.checked_add(2)?.checked_add(entries_bytes)?;
        let ifd_end = next_ptr_pos.checked_add(4)?;
        if ifd_end > bytes.len() {
            return None;
        }

        for i in 0..entry_count {
            let e_off = base + 2 + i * 12;
            let tag = read_u16(e_off)?;
            let ty = read_u16(e_off + 2)?;
            let cnt = read_u32(e_off + 4)? as usize;

            // Make (0x010F, ASCII)
            if tag == 0x010F && ty == 2 && cnt >= 5 {
                let str_pos = if cnt <= 4 {
                    Some(e_off + 8)
                } else {
                    read_u32(e_off + 8).map(|p| p as usize)
                };
                if let Some(sp) = str_pos
                    && let Some(slice) = bytes.get(sp..sp.saturating_add(5))
                    && slice.eq_ignore_ascii_case(b"NIKON")
                {
                    is_nikon = true;
                }
            }

            // Compression (0x0103): 52546 = TicoRAW / JPEG XS
            if tag == 0x0103
                && let Some(comp) = read_scalar_u32(ty, cnt, e_off + 8)
                && comp == 52546
            {
                has_tico_marker = true;
            }

            // StripOffsets (0x0111): Nikon HE NEF stores Compression=34713 with JPEG XS SOC+CAP `FF 10 FF 50` at strip start.
            if tag == 0x0111 && cnt >= 1 {
                let strip_off_opt = if cnt == 1 {
                    read_scalar_u32(ty, 1, e_off + 8).map(|v| v as usize)
                } else if (ty == 4 || ty == 13) && cnt <= 65536 {
                    read_u32(e_off + 8)
                        .and_then(|arr| read_u32(arr as usize))
                        .map(|v| v as usize)
                } else {
                    None
                };
                if let Some(so) = strip_off_opt
                    && let Some(magic) = bytes.get(so..so.saturating_add(4))
                    && magic == [0xFF, 0x10, 0xFF, 0x50]
                {
                    has_tico_marker = true;
                }
            }

            // Validate SubIFDs (0x014A) and ExifIFD (0x8769) offsets so cyclic or truncated SubIFDs fail cleanly.
            if (tag == 0x014A || tag == 0x8769) && (ty == 4 || ty == 13) && cnt > 0 && cnt <= 32 {
                if cnt == 1 {
                    if let Some(sub_off) = read_u32(e_off + 8)
                        && sub_off > 0
                    {
                        if (sub_off as usize) < 8 || (sub_off as usize) >= bytes.len() {
                            return None;
                        }
                        if visited[..visited_len].contains(&sub_off) {
                            return None;
                        }
                        if stack_len < stack.len() {
                            stack[stack_len] = sub_off;
                            stack_len += 1;
                        }
                    }
                } else if let Some(arr_off_u32) = read_u32(e_off + 8) {
                    let arr_off = arr_off_u32 as usize;
                    let arr_end = cnt.checked_mul(4)?.checked_add(arr_off)?;
                    if arr_off < 8 || arr_end > bytes.len() {
                        return None;
                    }
                    for k in 0..cnt {
                        if let Some(sub_off) = read_u32(arr_off + k * 4)
                            && sub_off > 0
                        {
                            if (sub_off as usize) < 8 || (sub_off as usize) >= bytes.len() {
                                return None;
                            }
                            if visited[..visited_len].contains(&sub_off) {
                                return None;
                            }
                            if stack_len < stack.len() {
                                stack[stack_len] = sub_off;
                                stack_len += 1;
                            }
                        }
                    }
                }
            }
        }

        if let Some(next_ifd) = read_u32(next_ptr_pos)
            && next_ifd != 0
        {
            if (next_ifd as usize) < 8 || (next_ifd as usize) >= bytes.len() {
                return None;
            }
            if visited[..visited_len].contains(&next_ifd) {
                return None;
            }
            if stack_len < stack.len() {
                stack[stack_len] = next_ifd;
                stack_len += 1;
            }
        }
    }

    Some(is_nikon && has_tico_marker)
}

/// Decode a RAW image strictly from an in-memory byte slice (`&[u8]`) with zero `std::fs` calls.
pub fn decode_raw_bytes(bytes: &[u8]) -> Result<DecodedRawImage, CollimaError> {
    if bytes.len() < 64 {
        return Err(CollimaError::EmptyBuffer(bytes.len()));
    }

    // Pre-validate standard little/big-endian TIFF IFD graphs so cyclic or truncated IFDs never hang or panic.
    if bytes.starts_with(b"II*\0") || bytes.starts_with(b"MM\0*") {
        match validate_tiff_ifd_structure(bytes) {
            None => {
                return Err(CollimaError::RawDecode(
                    "Corrupt, truncated, or cyclic TIFF IFD header".to_string(),
                ));
            }
            Some(true) => {
                let insp = ticoraw::inspect_nef(bytes)
                    .map_err(|e| CollimaError::TicoDecode(e.to_string()))?;
                return decode_nikon_ticoraw(bytes, insp);
            }
            Some(false) => {}
        }
    }

    // General path via FlashRaw (~40 formats incl. Sony ARW6, Canon CR3, DNG, RAF, RW2, classic NEF).
    decode_with_flashraw(bytes)
}

fn sanitize_levels(mut bl: [f32; 4], mut wl: [f32; 4]) -> ([f32; 4], [f32; 4]) {
    for i in 0..4 {
        if !bl[i].is_finite() {
            bl[i] = 0.0;
        } else {
            bl[i] = bl[i].clamp(0.0, 65535.0);
        }
        if !wl[i].is_finite() || wl[i] <= 0.0 {
            wl[i] = 16383.0;
        } else {
            wl[i] = wl[i].clamp(1.0, 65535.0);
        }
    }
    (bl, wl)
}

fn sanitize_wb(wb: [f32; 3]) -> [f32; 3] {
    if wb.iter().all(|v| v.is_finite() && *v > 1e-4 && *v < 64.0) {
        [wb[0] / wb[1], 1.0, wb[2] / wb[1]]
    } else {
        [1.8, 1.0, 1.5]
    }
}

fn decode_nikon_ticoraw(
    bytes: &[u8],
    insp: ticoraw::NefInspection,
) -> Result<DecodedRawImage, CollimaError> {
    let t0 = now_ms();

    // Parse EXIF/MakerNote metadata via FlashRaw header parser (no pixel decode!).
    let header_meta = FlashRaw::open(bytes).ok().map(|r| r.metadata().clone());

    let decoded =
        ticoraw::decode_nef(bytes).map_err(|e| CollimaError::TicoDecode(e.to_string()))?;
    let decode_ms = (now_ms() - t0).max(0.0);

    let raw_w = decoded.image.width;
    let raw_h = decoded.image.height;
    let Some(expected_samples) = raw_w.checked_mul(raw_h) else {
        return Err(CollimaError::InvalidActiveArea {
            width: raw_w as u32,
            height: raw_h as u32,
        });
    };
    if raw_w < 4 || raw_h < 4 || decoded.image.pixels.len() < expected_samples {
        return Err(CollimaError::TicoDecode(
            "Decoded TicoRAW pixel buffer dimensions do not match sample count".into(),
        ));
    }

    let (mut ax, mut ay, mut aw, mut ah) = if let Some(crop) = decoded.crop {
        (crop.x, crop.y, crop.width, crop.height)
    } else {
        (0, 0, raw_w, raw_h)
    };

    // Align active area to 2x2 superpixel boundaries inside buffer bounds (preserving odd ax/ay parity!).
    ax = ax.min(raw_w.saturating_sub(4));
    ay = ay.min(raw_h.saturating_sub(4));
    aw = aw.min(raw_w.saturating_sub(ax)) & !1;
    ah = ah.min(raw_h.saturating_sub(ay)) & !1;
    if aw < 4 || ah < 4 {
        return Err(CollimaError::InvalidActiveArea {
            width: aw as u32,
            height: ah as u32,
        });
    }

    // Resolve shifted 2x2 CFA at (ax, ay).
    // ticoraw `cfa_pattern` is row-major 2x2 at buffer (0, 0): 0 = R, 1 = G, 2 = B.
    let mut rx = 0usize;
    let mut ry = 0usize;
    for dy in 0..2usize {
        for dx in 0..2usize {
            let py = (ay + dy) & 1;
            let px = (ax + dx) & 1;
            if decoded.color.cfa_pattern[py * 2 + px] == 0 {
                rx = dx;
                ry = dy;
            }
        }
    }
    let bayer_offsets = BayerQuadOffsets::from_red_offset(rx, ry);

    // Map 2x2 black_level from buffer (0, 0) to canonical [R, G1, G2, B].
    let mut black_levels = [0.0f32; 4];
    for (ch, slot) in black_levels.iter_mut().enumerate() {
        let (dx, dy) = bayer_offsets.offset_for_channel(ch);
        let px = (ax + dx) & 1;
        let py = (ay + dy) & 1;
        *slot = decoded.color.black_level[py * 2 + px] as f32;
    }
    let wl = decoded.color.white_level as f32;
    let (black_levels, white_levels) = sanitize_levels(black_levels, [wl; 4]);

    // White balance from `as_shot_neutral` (reciprocal of camera neutral).
    let wb_rgb = sanitize_wb(
        if let Some([(rn, rd), (gn, gd), (bn, bd)]) = decoded.color.as_shot_neutral {
            let nr = if rd > 0 { rn as f32 / rd as f32 } else { 1.0 };
            let ng = if gd > 0 { gn as f32 / gd as f32 } else { 1.0 };
            let nb = if bd > 0 { bn as f32 / bd as f32 } else { 1.0 };
            if nr > 1e-5 && ng > 1e-5 && nb > 1e-5 {
                let r_mul = (1.0 / nr) / (1.0 / ng);
                let b_mul = (1.0 / nb) / (1.0 / ng);
                [r_mul, 1.0, b_mul]
            } else {
                [1.8, 1.0, 1.5]
            }
        } else {
            [1.8, 1.0, 1.5]
        },
    );

    let cam_wb_to_srgb = if let Some(cm_rat) = decoded.color.color_matrix {
        let mut xyz_to_cam = [[0.0f64; 3]; 3];
        for i in 0..9 {
            let (n, d) = cm_rat[i];
            xyz_to_cam[i / 3][i % 3] = if d != 0 { n as f64 / d as f64 } else { 0.0 };
        }
        compute_cam_wb_to_srgb_matrix(&xyz_to_cam)
    } else {
        IDENTITY_3X3
    };

    let clean_camera = ticoraw::unique_camera_model(&decoded.make, &decoded.model);
    let compression_name = insp
        .compression
        .map(|c| c.to_string())
        .unwrap_or_else(|| "Nikon High Efficiency (TicoRAW)".to_string());

    let (lens_make, lens_model, iso, exposure_time_sec, f_number, focal_length_mm, capture_time) =
        if let Some(hm) = &header_meta {
            (
                hm.lens.make.clone(),
                hm.lens.model.clone(),
                hm.exposure.iso.filter(|&v| v > 0),
                hm.exposure
                    .exposure_time
                    .filter(|v| v.is_finite() && *v > 0.0),
                hm.exposure.f_number.filter(|v| v.is_finite() && *v > 0.0),
                hm.exposure
                    .focal_length
                    .filter(|v| v.is_finite() && *v > 0.0),
                hm.capture_time.clone(),
            )
        } else {
            (None, None, None, None, None, None, None)
        };

    let mut warnings = vec![
        "Decoded Nikon High Efficiency (intoPIX TicoRAW / N-RAW JPEG XS) lossy wavelet stream; ultra-subtle dark-frame noise statistics reflect wavelet quantization.".to_string(),
    ];
    if iso.is_none() {
        warnings.push("EXIF ISO tag was not found in MakerNote/EXIF IFD.".to_string());
    }

    let meta = RawImageMetadata {
        make: decoded.make,
        model: decoded.model,
        camera_label: clean_camera,
        lens_make,
        lens_model,
        iso,
        exposure_time_sec,
        shutter_display: exposure_time_sec.map(format_shutter_speed),
        f_number,
        focal_length_mm,
        capture_time,
        raw_width: raw_w as u32,
        raw_height: raw_h as u32,
        active_x: ax as u32,
        active_y: ay as u32,
        active_width: aw as u32,
        active_height: ah as u32,
        bits_per_sample: insp.bits_per_sample as u8,
        cfa_pattern: bayer_offsets.pattern_string(),
        mosaic_kind: MosaicKind::Bayer2x2,
        black_levels,
        white_levels,
        wb_multipliers: wb_rgb,
        orientation_exif: decoded.orientation as u32,
        format_name: "NEF".to_string(),
        compression_name,
        decoder_engine: "ticoraw 0.2 (Nikon HE / JPEG-XS)".to_string(),
        decode_ms,
        warnings,
    };

    let mut img = DecodedRawImage {
        meta,
        stride: raw_w,
        buffer_height: raw_h,
        cpp: 1,
        pixels: decoded.image.pixels,
        active_rect: [ax, ay, aw, ah],
        bayer_offsets: Some(bayer_offsets),
        generic_cfa: None,
        black_levels,
        white_levels,
        wb_rgb,
        cam_wb_to_srgb,
    };
    apply_upright_orientation(&mut img);
    Ok(img)
}

fn decode_with_flashraw(bytes: &[u8]) -> Result<DecodedRawImage, CollimaError> {
    let t0 = now_ms();
    let raw = FlashRaw::open(bytes).map_err(|e| CollimaError::RawDecode(e.to_string()))?;

    let opts = DecodeOptions {
        backend: Backend::Auto,
        output: OutputFormat::RawU16,
        // Disable DNG bad-pixel / vignette opcodes so optical & dark-frame diagnostics see
        // genuine unmodified photosite ADUs.
        apply_opcodes: false,
        // Never substitute an 8-bit embedded JPEG preview for sensor diagnostics.
        preview_fallback: false,
        corruption_policy: CorruptionPolicy::Recover,
        ..Default::default()
    };

    let frame = raw
        .decode(opts)
        .map_err(|e| CollimaError::RawDecode(e.to_string()))?;
    let decode_ms = (now_ms() - t0).max(0.0);

    if frame.source == FrameSource::Preview {
        return Err(CollimaError::RawDecode(
            "Sensor stream could not be decoded (only embedded JPEG preview available)".into(),
        ));
    }

    let raw_w = frame.width as usize;
    let raw_h = frame.height as usize;
    let cpp = frame.cpp as usize;

    if !matches!(cpp, 1 | 3 | 4) {
        return Err(CollimaError::UnsupportedPixelData);
    }
    if raw_w < 4 || raw_h < 4 {
        return Err(CollimaError::InvalidActiveArea {
            width: frame.width,
            height: frame.height,
        });
    }
    let Some(expected_samples) = raw_w.checked_mul(raw_h).and_then(|n| n.checked_mul(cpp)) else {
        return Err(CollimaError::InvalidActiveArea {
            width: frame.width,
            height: frame.height,
        });
    };

    let mut warnings: Vec<String> = frame.warnings.iter().map(|w| format!("{w:?}")).collect();

    // Use default crop if valid inside active_area, otherwise active_area, so optical borders &
    // masked optical-black strips never pollute edge sharpness or full-frame noise stats.
    let base_rect = if !frame.crop.is_empty() && frame.active_area.contains_rect(&frame.crop) {
        frame.crop
    } else if !frame.active_area.is_empty() {
        frame.active_area
    } else {
        flashraw::Rect::full(frame.width, frame.height)
    };

    let ax = (base_rect.x as usize).min(raw_w.saturating_sub(4));
    let ay = (base_rect.y as usize).min(raw_h.saturating_sub(4));
    let mut aw = (base_rect.width as usize).min(raw_w.saturating_sub(ax));
    let mut ah = (base_rect.height as usize).min(raw_h.saturating_sub(ay));

    let (mosaic_kind, bayer_offsets, generic_cfa, cfa_pattern_str) = if cpp >= 3 {
        if cpp == 4 {
            warnings.push(
                "4-plane Pixel-Shift / Linear RAW (cpp == 4, [R, G1, B, G2]): G1 and G2 are evaluated on their independent full-resolution Green planes.".to_string(),
            );
        } else {
            warnings.push(
                "Pre-demosaiced Linear RGB RAW (cpp == 3): per-Bayer-channel noise separation reflects RGB planes rather than raw CFA photosites.".to_string(),
            );
        }
        aw &= !1;
        ah &= !1;
        let label = if cpp == 4 {
            "LinearRGB4".to_string()
        } else {
            "LinearRGB".to_string()
        };
        (MosaicKind::LinearRgb, None, None, label)
    } else if let Some(cfa) = &frame.cfa {
        if cfa.is_bayer() && frame.sensor_layout == SensorLayout::Bayer {
            aw &= !1;
            ah &= !1;
            let mut rx = 0usize;
            let mut ry = 0usize;
            for dy in 0..2usize {
                for dx in 0..2usize {
                    if frame.color_at((ax + dx) as u32, (ay + dy) as u32) == Some(CfaColor::Red) {
                        rx = dx;
                        ry = dy;
                    }
                }
            }
            let bo = BayerQuadOffsets::from_red_offset(rx, ry);
            let pat = bo.pattern_string();
            (MosaicKind::Bayer2x2, Some(bo), None, pat)
        } else {
            aw &= !1;
            ah &= !1;
            let cw = cfa.width().max(1);
            let ch = cfa.height().max(1);
            let mut table = Vec::with_capacity(cw * ch);
            for y in 0..ch {
                for x in 0..cw {
                    let code = match cfa.color_at(x, y) {
                        CfaColor::Red => 0,
                        CfaColor::Green => 1,
                        CfaColor::Blue => 2,
                        _ => 1,
                    };
                    table.push(code);
                }
            }
            let kind = if cfa.is_xtrans() {
                warnings.push(
                    "Fujifilm 6x6 X-Trans CFA detected: Green photosites partitioned by even/odd rows into G1/G2."
                        .to_string(),
                );
                MosaicKind::XTrans6x6
            } else {
                MosaicKind::OtherSinglePlane
            };
            (kind, None, Some((cw, ch, table)), cfa.to_string())
        }
    } else {
        aw &= !1;
        ah &= !1;
        warnings.push("Monochrome sensor (no CFA filter array).".to_string());
        (
            MosaicKind::OtherSinglePlane,
            None,
            Some((1, 1, vec![1])),
            "Monochrome".to_string(),
        )
    };

    if aw < 4 || ah < 4 {
        return Err(CollimaError::InvalidActiveArea {
            width: aw as u32,
            height: ah as u32,
        });
    }

    // Extract nominal black & white levels for canonical [R, G1, G2, B].
    // Note: in `flashraw`, `cpp == 4` (e.g. Sony `.ARQ` Pixel Shift & 4-plane Linear DNG) stores
    // components in `[0 = R, 1 = G1, 2 = B, 3 = G2]` order!
    let (raw_bl, raw_wl) = if let Some(bo) = &bayer_offsets {
        let mut bl = [0.0f32; 4];
        for (ch, slot) in bl.iter_mut().enumerate() {
            let (dx, dy) = bo.offset_for_channel(ch);
            // Sample representative interior coordinates in case DNG/Canon row_deltas or col_deltas exist.
            let mid_x = ax + ((aw / 2) & !1) + dx;
            let mid_y = ay + ((ah / 2) & !1) + dy;
            *slot = frame.black_level.at(mid_x, mid_y, 0);
        }
        let wl = [
            frame.white_level.at(CfaColor::Red as usize) as f32,
            frame.white_level.at(CfaColor::Green as usize) as f32,
            frame.white_level.at(CfaColor::Green as usize) as f32,
            frame.white_level.at(CfaColor::Blue as usize) as f32,
        ];
        (bl, wl)
    } else if cpp >= 4 {
        let bl = [
            frame.black_level.at(ax, ay, 0),
            frame.black_level.at(ax, ay, 1),
            frame.black_level.at(ax, ay, 3),
            frame.black_level.at(ax, ay, 2),
        ];
        let wl = [
            frame.white_level.at(0) as f32,
            frame.white_level.at(1) as f32,
            frame.white_level.at(3) as f32,
            frame.white_level.at(2) as f32,
        ];
        (bl, wl)
    } else if cpp == 3 {
        let bl = [
            frame.black_level.at(ax, ay, 0),
            frame.black_level.at(ax, ay, 1),
            frame.black_level.at(ax, ay, 1),
            frame.black_level.at(ax, ay, 2),
        ];
        let wl = [
            frame.white_level.at(0) as f32,
            frame.white_level.at(1) as f32,
            frame.white_level.at(1) as f32,
            frame.white_level.at(2) as f32,
        ];
        (bl, wl)
    } else {
        let b0 = frame.black_level.mean();
        let w0 = frame.white_level.max().max(1) as f32;
        ([b0; 4], [w0; 4])
    };
    let (black_levels, white_levels) = sanitize_levels(raw_bl, raw_wl);

    // White-balance multipliers [R, G, B].
    let wb_rgb = sanitize_wb(if frame.white_balance_applied {
        warnings.push(
            "Camera pre-applied white balance in RAW container (e.g. YCbCr M/S RAW or sRAW)."
                .to_string(),
        );
        [1.0, 1.0, 1.0]
    } else if let Some(wb) = frame.white_balance {
        [wb.coeffs[0], wb.coeffs[1].max(1e-5), wb.coeffs[2]]
    } else if let Some(cm) = frame.color_matrices.preferred() {
        if let Some(m) = cm.multipliers_for([1.0, 1.0, 1.0]) {
            if m.len() >= 3 && m[1] > 1e-5 {
                [m[0] / m[1], 1.0, m[2] / m[1]]
            } else {
                [1.8, 1.0, 1.5]
            }
        } else {
            [1.8, 1.0, 1.5]
        }
    } else {
        [1.8, 1.0, 1.5]
    });

    let cam_wb_to_srgb = if let Some(cm) = frame.color_matrices.preferred() {
        if cm.rows >= 3 && cm.values.len() >= 9 {
            let mut xyz_to_cam = [[0.0f64; 3]; 3];
            for (r, row) in xyz_to_cam.iter_mut().enumerate() {
                for (c, slot) in row.iter_mut().enumerate() {
                    *slot = cm.get(r, c) as f64;
                }
            }
            compute_cam_wb_to_srgb_matrix(&xyz_to_cam)
        } else {
            IDENTITY_3X3
        }
    } else {
        IDENTITY_3X3
    };

    let fm = &frame.metadata;
    let format_name = fm
        .format
        .map(|f| format!("{f:?}").to_uppercase())
        .unwrap_or_else(|| "RAW".to_string());
    let raw_compression = fm
        .compression
        .map(|c| format!("{c:?}"))
        .unwrap_or_else(|| "Uncompressed".to_string());

    // flashraw maps Sony TIFF Compression 32766 (ARW 6.0 Compressed / Compressed HQ, i.e. Sony
    // CineAlta X-OCN / LLVC3 5/3 wavelet + 12->16-bit LLVC3_CURVE [BL=1024, WL=39002]) to `Other`.
    let is_sony_xocn = (format_name == "ARW" || fm.make.eq_ignore_ascii_case("Sony"))
        && (raw_compression == "Other"
            || (white_levels[0] - 39002.0).abs() < 1.0
            || raw_compression.to_ascii_lowercase().contains("arw6")
            || fm
                .extra
                .iter()
                .any(|(_, v)| v.to_ascii_lowercase().contains("arw6")));

    let compression_name = if is_sony_xocn {
        "X-OCN / LLVC3 (ARW 6.0)".to_string()
    } else {
        raw_compression
    };

    if is_sony_xocn {
        warnings.push(
            "Sony X-OCN / LLVC3 (ARW 6.0 Compressed / HQ) 5/3 wavelet stream detected: decoded pixels are mapped via the 12->16-bit LLVC3 linearization LUT (BL=1024, WL=39002). Engineering DR (EV) remains scale-invariant, while sigma_ADU is expressed in the linearized LLVC3 domain rather than raw 14-bit ADC codes."
                .to_string(),
        );
    }

    let make = fm.make.clone();
    let model = fm.model.clone();
    let camera_label = fm.camera();
    let lens_make = fm.lens.make.clone();
    let lens_model = fm.lens.model.clone();
    let iso = fm.exposure.iso.filter(|&v| v > 0);
    let exposure_time_sec = fm
        .exposure
        .exposure_time
        .filter(|v| v.is_finite() && *v > 0.0);
    let shutter_display = exposure_time_sec.map(format_shutter_speed);
    let f_number = fm.exposure.f_number.filter(|v| v.is_finite() && *v > 0.0);
    let focal_length_mm = fm
        .exposure
        .focal_length
        .filter(|v| v.is_finite() && *v > 0.0);
    let capture_time = fm.capture_time.clone();
    let bits_per_sample = frame.bits_per_sample;
    let orientation_exif = frame.orientation.exif();
    let max_wl = frame.white_level.max().max(1) as f32;

    // Extract u16 buffer (converting f32 if needed) with zero-copy move for U16.
    let (pixels, black_levels, white_levels): (Vec<u16>, [f32; 4], [f32; 4]) = match frame.data {
        flashraw::RawPixelData::U16(v) => (v, black_levels, white_levels),
        flashraw::RawPixelData::F32(vf) => {
            warnings.push(
                "Floating-point RAW container scaled to 16-bit integer domain for analysis."
                    .to_string(),
            );
            let scale = if max_wl <= 2.0 { 16383.0 / max_wl } else { 1.0 };
            let scaled: Vec<u16> = vf
                .into_iter()
                .map(|x| {
                    if x.is_finite() {
                        (x * scale).clamp(0.0, 65535.0).round() as u16
                    } else {
                        0
                    }
                })
                .collect();
            let (s_bl, s_wl) = if scale != 1.0 {
                sanitize_levels(
                    black_levels.map(|b| b * scale),
                    white_levels.map(|w| w * scale),
                )
            } else {
                (black_levels, white_levels)
            };
            (scaled, s_bl, s_wl)
        }
        _ => return Err(CollimaError::UnsupportedPixelData),
    };

    if pixels.len() < expected_samples {
        return Err(CollimaError::RawDecode(format!(
            "Decoded pixel buffer shorter than expected ({} < {})",
            pixels.len(),
            expected_samples
        )));
    }

    let meta = RawImageMetadata {
        make,
        model,
        camera_label,
        lens_make,
        lens_model,
        iso,
        exposure_time_sec,
        shutter_display,
        f_number,
        focal_length_mm,
        capture_time,
        raw_width: raw_w as u32,
        raw_height: raw_h as u32,
        active_x: ax as u32,
        active_y: ay as u32,
        active_width: aw as u32,
        active_height: ah as u32,
        bits_per_sample,
        cfa_pattern: cfa_pattern_str,
        mosaic_kind,
        black_levels,
        white_levels,
        wb_multipliers: wb_rgb,
        orientation_exif,
        format_name,
        compression_name,
        decoder_engine: "flashraw 0.2 (SIMD)".to_string(),
        decode_ms,
        warnings,
    };

    let mut img = DecodedRawImage {
        meta,
        stride: raw_w,
        buffer_height: raw_h,
        cpp,
        pixels,
        active_rect: [ax, ay, aw, ah],
        bayer_offsets,
        generic_cfa,
        black_levels,
        white_levels,
        wb_rgb,
        cam_wb_to_srgb,
    };
    apply_upright_orientation(&mut img);
    Ok(img)
}

/// Losslessly permute active sensor samples into upright display orientation when EXIF
/// `orientation_exif` is in `2..=8` (e.g. `6` = 90° CW portrait, `8` = 270° CW portrait,
/// `3` = 180°), updating `active_rect`, `BayerQuadOffsets`, `G1`/`G2` calibration levels,
/// and `generic_cfa` so overview, 5x5 heatmap, 9-grid stations, and tilt compass all align.
fn apply_upright_orientation(img: &mut DecodedRawImage) {
    let ori = img.meta.orientation_exif;
    if !(2..=8).contains(&ori) {
        return;
    }

    let [ax, ay, aw, ah] = img.active_rect;
    let swaps = matches!(ori, 5..=8);
    let (out_w, out_h) = if swaps { (ah, aw) } else { (aw, ah) };
    let cpp = img.cpp;

    let map_uv_to_src = |u: usize, v: usize| -> (usize, usize) {
        match ori {
            2 => (aw - 1 - u, v),
            3 => (aw - 1 - u, ah - 1 - v),
            4 => (u, ah - 1 - v),
            5 => (v, u),
            6 => (v, ah - 1 - u),
            7 => (ah - 1 - v, aw - 1 - u),
            8 => (aw - 1 - v, u),
            _ => (u, v),
        }
    };

    let mut upright = vec![0u16; out_w * out_h * cpp];
    if cpp == 1 {
        for v in 0..out_h {
            let dst_row = v * out_w;
            for u in 0..out_w {
                let (sx, sy) = map_uv_to_src(u, v);
                upright[dst_row + u] = img.pixels[(ay + sy) * img.stride + (ax + sx)];
            }
        }
    } else {
        for v in 0..out_h {
            for u in 0..out_w {
                let (sx, sy) = map_uv_to_src(u, v);
                let src = ((ay + sy) * img.stride + (ax + sx)) * cpp;
                let dst = (v * out_w + u) * cpp;
                upright[dst..dst + cpp].copy_from_slice(&img.pixels[src..src + cpp]);
            }
        }
        // For 4-plane Pixel Shift (R, G1, B, G2), swapping rows/cols swaps G1 (c=1) and G2 (c=3).
        if swaps && cpp >= 4 {
            for px in upright.chunks_exact_mut(cpp) {
                px.swap(1, 3);
            }
        }
    }

    if let Some(old_bo) = img.bayer_offsets {
        let mut new_rx = 0usize;
        let mut new_ry = 0usize;
        for dv in 0..2usize {
            for du in 0..2usize {
                let (sx, sy) = map_uv_to_src(du, dv);
                if (sx & 1, sy & 1) == old_bo.r {
                    new_rx = du;
                    new_ry = dv;
                }
            }
        }
        let new_bo = BayerQuadOffsets::from_red_offset(new_rx, new_ry);
        img.meta.cfa_pattern = new_bo.pattern_string();
        img.bayer_offsets = Some(new_bo);
    }

    if swaps && (img.bayer_offsets.is_some() || cpp >= 4) {
        img.black_levels.swap(1, 2);
        img.white_levels.swap(1, 2);
        img.meta.black_levels = img.black_levels;
        img.meta.white_levels = img.white_levels;
    }

    if let Some((cw, ch, old_table)) = &img.generic_cfa {
        let (new_cw, new_ch) = if swaps { (*ch, *cw) } else { (*cw, *ch) };
        let mut new_table = vec![1u8; new_cw * new_ch];
        let aw_i = aw as isize;
        let ah_i = ah as isize;
        for dv in 0..new_ch {
            for du in 0..new_cw {
                let u = du as isize;
                let v = dv as isize;
                let (sx_i, sy_i) = match ori {
                    2 => (aw_i - 1 - u, v),
                    3 => (aw_i - 1 - u, ah_i - 1 - v),
                    4 => (u, ah_i - 1 - v),
                    5 => (v, u),
                    6 => (v, ah_i - 1 - u),
                    7 => (ah_i - 1 - v, aw_i - 1 - u),
                    8 => (aw_i - 1 - v, u),
                    _ => (u, v),
                };
                let px = (ax as isize + sx_i).rem_euclid(*cw as isize) as usize;
                let py = (ay as isize + sy_i).rem_euclid(*ch as isize) as usize;
                new_table[dv * new_cw + du] = old_table[py * *cw + px];
            }
        }
        img.generic_cfa = Some((new_cw, new_ch, new_table));
    }

    img.pixels = upright;
    img.stride = out_w;
    img.buffer_height = out_h;
    img.active_rect = [0, 0, out_w, out_h];
    img.meta.active_x = 0;
    img.meta.active_y = 0;
    img.meta.active_width = out_w as u32;
    img.meta.active_height = out_h as u32;
    img.meta.warnings.push(format!(
        "Applied lossless EXIF orientation {} transform to align sensor geometry ({}x{}).",
        ori, out_w, out_h
    ));
}

const IDENTITY_3X3: [[f32; 3]; 3] = [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]];

/// Convert a DNG `XYZ (D65) -> Camera RGB` 3x3 matrix into a row-normalized inverted
/// `White-Balanced Camera RGB -> Linear sRGB (D65)` 3x3 matrix.
pub fn compute_cam_wb_to_srgb_matrix(xyz_to_cam: &[[f64; 3]; 3]) -> [[f32; 3]; 3] {
    const SRGB_TO_XYZ: [[f64; 3]; 3] = [
        [0.4124564, 0.3575761, 0.1804375],
        [0.2126729, 0.7151522, 0.0721750],
        [0.0193339, 0.1191920, 0.9503041],
    ];

    let mut srgb_to_cam = [[0.0f64; 3]; 3];
    for i in 0..3 {
        let mut row_sum = 0.0;
        for j in 0..3 {
            let mut acc = 0.0;
            for k in 0..3 {
                acc += xyz_to_cam[i][k] * SRGB_TO_XYZ[k][j];
            }
            srgb_to_cam[i][j] = acc;
            row_sum += acc;
        }
        if row_sum.abs() < 1e-8 {
            return IDENTITY_3X3;
        }
        for val in &mut srgb_to_cam[i] {
            *val /= row_sum;
        }
    }

    invert_3x3(&srgb_to_cam).unwrap_or(IDENTITY_3X3)
}

fn invert_3x3(m: &[[f64; 3]; 3]) -> Option<[[f32; 3]; 3]> {
    let c00 = m[1][1] * m[2][2] - m[1][2] * m[2][1];
    let c01 = -(m[1][0] * m[2][2] - m[1][2] * m[2][0]);
    let c02 = m[1][0] * m[2][1] - m[1][1] * m[2][0];

    let det = m[0][0] * c00 + m[0][1] * c01 + m[0][2] * c02;
    if !det.is_finite() || det.abs() < 1e-8 {
        return None;
    }
    let inv_det = 1.0 / det;

    let c10 = -(m[0][1] * m[2][2] - m[0][2] * m[2][1]);
    let c11 = m[0][0] * m[2][2] - m[0][2] * m[2][0];
    let c12 = -(m[0][0] * m[2][1] - m[0][1] * m[2][0]);

    let c20 = m[0][1] * m[1][2] - m[0][2] * m[1][1];
    let c21 = -(m[0][0] * m[1][2] - m[0][2] * m[1][0]);
    let c22 = m[0][0] * m[1][1] - m[0][1] * m[1][0];

    let out = [
        [
            (c00 * inv_det) as f32,
            (c10 * inv_det) as f32,
            (c20 * inv_det) as f32,
        ],
        [
            (c01 * inv_det) as f32,
            (c11 * inv_det) as f32,
            (c21 * inv_det) as f32,
        ],
        [
            (c02 * inv_det) as f32,
            (c12 * inv_det) as f32,
            (c22 * inv_det) as f32,
        ],
    ];
    if out.iter().flatten().all(|v| v.is_finite()) {
        Some(out)
    } else {
        None
    }
}

pub fn format_shutter_speed(sec: f64) -> String {
    if !sec.is_finite() || sec <= 0.0 {
        return "—".to_string();
    }
    if sec >= 1.0 {
        if (sec - sec.round()).abs() < 0.05 {
            format!("{:.0}s", sec.round())
        } else {
            format!("{:.1}s", sec)
        }
    } else {
        let denom = (1.0 / sec).round();
        format!("1/{:.0}s", denom.max(1.0))
    }
}

fn now_ms() -> f64 {
    flashraw::low_level::core::profile::now_ms()
}
