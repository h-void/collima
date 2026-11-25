//! Standards-compliant in-memory 14-bit uncompressed Bayer `.DNG` synthesizer.
//!
//! Used both for deterministic end-to-end Rust unit tests (`cargo test`) and for the
//! interactive 1-click calibration demo suite in the browser UI.

/// Deterministic Xorshift64* PRNG + Box-Muller Gaussian sampler (zero external RNG dependencies).
struct Rng64(u64);

impl Rng64 {
    fn new(seed: u64) -> Self {
        Self(seed ^ 0x9E37_79B9_7F4A_7C15)
    }

    #[inline]
    fn next_u64(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        self.0 = x;
        x.wrapping_mul(0x2545_F491_4F6C_DD1D)
    }

    #[inline]
    fn next_f64(&mut self) -> f64 {
        ((self.next_u64() >> 11) as f64) * (1.0 / ((1u64 << 53) as f64))
    }

    #[inline]
    fn normal(&mut self) -> f64 {
        let u1 = self.next_f64().max(1e-12);
        let u2 = self.next_f64();
        (-2.0 * u1.ln()).sqrt() * (std::f64::consts::TAU * u2).cos()
    }
}

pub struct DngSynthMeta<'a> {
    pub make: &'a str,
    pub model: &'a str,
    pub lens_model: &'a str,
    pub iso: u32,
    pub exposure_num: u32,
    pub exposure_den: u32,
    pub f_number_tenths: u32,
    pub focal_mm: u32,
    pub black_level: [u32; 4],
    pub white_level: u32,
    /// `RGGB` CFA pattern `[0, 1, 1, 2]`
    pub cfa_pattern: [u8; 4],
}

/// Encode raw `u16` Bayer samples + EXIF/DNG calibration tags into an in-memory `.DNG` byte vector.
pub fn encode_uncompressed_dng(
    width: u32,
    height: u32,
    pixels: &[u16],
    meta: &DngSynthMeta<'_>,
) -> Vec<u8> {
    assert_eq!(pixels.len(), (width as usize) * (height as usize));

    let mut exif_ifd = IfdWriter::new();
    // 0x829A ExposureTime (RATIONAL)
    exif_ifd.add_rational(0x829A, &[(meta.exposure_num, meta.exposure_den)]);
    // 0x829D FNumber (RATIONAL)
    exif_ifd.add_rational(0x829D, &[(meta.f_number_tenths, 10)]);
    // 0x8827 ISOSpeedRatings (SHORT / LONG)
    if meta.iso <= 65535 {
        exif_ifd.add_u16(0x8827, &[meta.iso as u16]);
    } else {
        exif_ifd.add_u32(0x8827, &[meta.iso]);
    }
    // 0x8830 SensitivityType = 2 (Recommended Exposure Index) + 0x8832 RecommendedExposureIndex
    exif_ifd.add_u16(0x8830, &[2]);
    exif_ifd.add_u32(0x8832, &[meta.iso]);
    // 0x920A FocalLength (RATIONAL)
    exif_ifd.add_rational(0x920A, &[(meta.focal_mm, 1)]);
    // 0xA433 LensMake, 0xA434 LensModel
    exif_ifd.add_ascii(0xA433, meta.make);
    exif_ifd.add_ascii(0xA434, meta.lens_model);

    let unique_model = format!("{} {}", meta.make, meta.model);
    let strip_byte_count = (pixels.len() * 2) as u32;

    // Reserve header (8 bytes) + ExifIFD + IFD0, then place pixel strip aligned to 4 bytes.
    let mut out = Vec::with_capacity(4096 + strip_byte_count as usize);
    out.extend_from_slice(b"II");
    out.extend_from_slice(&42u16.to_le_bytes());
    out.extend_from_slice(&0u32.to_le_bytes()); // patched to IFD0 offset below

    let exif_offset = exif_ifd.emit(&mut out);

    // Reserve placeholder for strip offset; build IFD0 first with a dummy StripOffsets, or emit strip first!
    // Emitting pixel strip BEFORE IFD0 makes StripOffsets known immediately with zero patching!
    while out.len() % 4 != 0 {
        out.push(0);
    }
    let strip_offset = out.len() as u32;
    for &px in pixels {
        out.extend_from_slice(&px.to_le_bytes());
    }
    while out.len() % 4 != 0 {
        out.push(0);
    }

    let mut ifd0 = IfdWriter::new();
    ifd0.add_u32(0x00FE, &[0]); // NewSubfileType = full-resolution raw image
    ifd0.add_u32(0x0100, &[width]); // ImageWidth
    ifd0.add_u32(0x0101, &[height]); // ImageLength
    ifd0.add_u16(0x0102, &[16]); // BitsPerSample
    ifd0.add_u16(0x0103, &[1]); // Compression = Uncompressed
    ifd0.add_u16(0x0106, &[32803]); // PhotometricInterpretation = CFA
    ifd0.add_ascii(0x010F, meta.make); // Make
    ifd0.add_ascii(0x0110, meta.model); // Model
    ifd0.add_u32(0x0111, &[strip_offset]); // StripOffsets
    ifd0.add_u16(0x0112, &[1]); // Orientation = Normal
    ifd0.add_u16(0x0115, &[1]); // SamplesPerPixel = 1
    ifd0.add_u32(0x0116, &[height]); // RowsPerStrip
    ifd0.add_u32(0x0117, &[strip_byte_count]); // StripByteCounts
    ifd0.add_u16(0x011C, &[1]); // PlanarConfiguration = Chunky
    ifd0.add_ascii(0x0131, "Collima Synthetic Metrology Generator 0.1"); // Software
    ifd0.add_u16(0x828D, &[2, 2]); // CFARepeatPatternDim
    ifd0.add_bytes(0x828E, &meta.cfa_pattern); // CFAPattern
    ifd0.add_u32(0x8769, &[exif_offset]); // ExifIFD pointer
    ifd0.add_bytes(0xC612, &[1, 4, 0, 0]); // DNGVersion = 1.4.0.0
    ifd0.add_bytes(0xC613, &[1, 4, 0, 0]); // DNGBackwardVersion
    ifd0.add_ascii(0xC614, &unique_model); // UniqueCameraModel
    ifd0.add_u16(0xC619, &[2, 2]); // BlackLevelRepeatDim
    ifd0.add_u32(0xC61A, &meta.black_level); // BlackLevel
    ifd0.add_u32(0xC61D, &[meta.white_level]); // WhiteLevel
    // Standard D65 ColorMatrix1 (XYZ -> Camera RGB) typical of modern BSI CMOS sensors:
    ifd0.add_srational(
        0xC621,
        &[
            (6722, 10000),
            (-1386, 10000),
            (-478, 10000),
            (-4231, 10000),
            (12160, 10000),
            (2318, 10000),
            (-697, 10000),
            (1631, 10000),
            (6498, 10000),
        ],
    );
    // AsShotNeutral (~5500K daylight: R_neutral = 0.48, G_neutral = 1.0, B_neutral = 0.62)
    ifd0.add_rational(0xC628, &[(4800, 10000), (10000, 10000), (6200, 10000)]);
    ifd0.add_u16(0xC65A, &[21]); // CalibrationIlluminant1 = D65

    let ifd0_offset = ifd0.emit(&mut out);
    out[4..8].copy_from_slice(&ifd0_offset.to_le_bytes());
    out
}

struct IfdEntry {
    tag: u16,
    ty: u16,
    count: u32,
    payload: Vec<u8>,
}

struct IfdWriter {
    entries: Vec<IfdEntry>,
}

impl IfdWriter {
    fn new() -> Self {
        Self {
            entries: Vec::new(),
        }
    }

    fn add_bytes(&mut self, tag: u16, vals: &[u8]) {
        self.entries.push(IfdEntry {
            tag,
            ty: 1, // BYTE
            count: vals.len() as u32,
            payload: vals.to_vec(),
        });
    }

    fn add_ascii(&mut self, tag: u16, s: &str) {
        let mut payload = s.as_bytes().to_vec();
        payload.push(0);
        self.entries.push(IfdEntry {
            tag,
            ty: 2, // ASCII
            count: payload.len() as u32,
            payload,
        });
    }

    fn add_u16(&mut self, tag: u16, vals: &[u16]) {
        let mut payload = Vec::with_capacity(vals.len() * 2);
        for &v in vals {
            payload.extend_from_slice(&v.to_le_bytes());
        }
        self.entries.push(IfdEntry {
            tag,
            ty: 3, // SHORT
            count: vals.len() as u32,
            payload,
        });
    }

    fn add_u32(&mut self, tag: u16, vals: &[u32]) {
        let mut payload = Vec::with_capacity(vals.len() * 4);
        for &v in vals {
            payload.extend_from_slice(&v.to_le_bytes());
        }
        self.entries.push(IfdEntry {
            tag,
            ty: 4, // LONG
            count: vals.len() as u32,
            payload,
        });
    }

    fn add_rational(&mut self, tag: u16, vals: &[(u32, u32)]) {
        let mut payload = Vec::with_capacity(vals.len() * 8);
        for &(n, d) in vals {
            payload.extend_from_slice(&n.to_le_bytes());
            payload.extend_from_slice(&d.to_le_bytes());
        }
        self.entries.push(IfdEntry {
            tag,
            ty: 5, // RATIONAL
            count: vals.len() as u32,
            payload,
        });
    }

    fn add_srational(&mut self, tag: u16, vals: &[(i32, i32)]) {
        let mut payload = Vec::with_capacity(vals.len() * 8);
        for &(n, d) in vals {
            payload.extend_from_slice(&n.to_le_bytes());
            payload.extend_from_slice(&d.to_le_bytes());
        }
        self.entries.push(IfdEntry {
            tag,
            ty: 10, // SRATIONAL
            count: vals.len() as u32,
            payload,
        });
    }

    fn emit(mut self, out: &mut Vec<u8>) -> u32 {
        while !out.len().is_multiple_of(4) {
            out.push(0);
        }
        self.entries.sort_by_key(|e| e.tag);

        let ifd_offset = out.len() as u32;
        let n = self.entries.len() as u16;
        let table_bytes = 2 + (self.entries.len() * 12) + 4;
        let heap_offset = ifd_offset + table_bytes as u32;
        let mut heap = Vec::new();

        out.extend_from_slice(&n.to_le_bytes());
        for e in &self.entries {
            out.extend_from_slice(&e.tag.to_le_bytes());
            out.extend_from_slice(&e.ty.to_le_bytes());
            out.extend_from_slice(&e.count.to_le_bytes());
            if e.payload.len() <= 4 {
                let mut inline = [0u8; 4];
                inline[..e.payload.len()].copy_from_slice(&e.payload);
                out.extend_from_slice(&inline);
            } else {
                while !(heap_offset as usize + heap.len()).is_multiple_of(4) {
                    heap.push(0);
                }
                let ptr = heap_offset + heap.len() as u32;
                out.extend_from_slice(&ptr.to_le_bytes());
                heap.extend_from_slice(&e.payload);
            }
        }
        out.extend_from_slice(&0u32.to_le_bytes()); // next IFD = 0
        out.extend_from_slice(&heap);
        ifd_offset
    }
}

/// Generate a 14-bit Bayer `.DNG` of an optical MTF & brick-grid test chart with controlled
/// focal-plane tilt (`tilt_strength = 0.0` for flat reference, `0.0..=1.0` for Top-Left mount tilt)
/// and realistic cos^4 optical vignetting.
pub fn generate_tilted_chart_dng(width: u32, height: u32, tilt_strength: f32) -> Vec<u8> {
    let w = (width.clamp(128, 4096) & !1) as usize;
    let h = (height.clamp(128, 4096) & !1) as usize;
    let tilt = if tilt_strength.is_finite() {
        tilt_strength.clamp(0.0, 1.5) as f64
    } else {
        0.0
    };

    // Synthesize high-contrast linear luminance chart on [0.08, 0.78] before PSF & vignetting.
    let mut lum = vec![0.0f32; w * h];
    let mut chroma_tint = vec![[1.0f32; 3]; w * h];

    for y in 0..h {
        let ny = y as f64 / h as f64;
        for x in 0..w {
            let nx = x as f64 / w as f64;

            // Base fine checkerboard + brick mortar + Siemens spokes around the 9 optical stations.
            let fine_chk = if ((x / 3) + (y / 3)) % 2 == 0 {
                0.68
            } else {
                0.18
            };
            let mortar = if y % 28 < 2 || ((x + (y / 28) * 18) % 36) < 2 {
                0.82
            } else {
                fine_chk
            };

            // Add Siemens star targets centered at {0.10, 0.50, 0.90} x {0.10, 0.50, 0.90}.
            let mut val = mortar;
            let mut rgb_mod = [1.0f32, 1.0f32, 1.0f32];
            for &sy in &[0.10f64, 0.50, 0.90] {
                for &sx in &[0.10f64, 0.50, 0.90] {
                    let dx = (nx - sx) * w as f64;
                    let dy = (ny - sy) * h as f64;
                    let r = (dx * dx + dy * dy).sqrt();
                    let radius_max = (w.min(h) as f64) * 0.055;
                    if r < radius_max && r > 3.0 {
                        let theta = dy.atan2(dx);
                        let spoke = (theta * 18.0).cos();
                        val = if spoke >= 0.0 { 0.78 } else { 0.12 };
                        rgb_mod = [1.04, 1.0, 0.96];
                    } else if (r - radius_max).abs() < 1.8 {
                        val = 0.85;
                        rgb_mod = [0.85, 1.02, 1.15];
                    }
                }
            }

            lum[y * w + x] = val as f32;
            chroma_tint[y * w + x] = rgb_mod;
        }
    }

    // Apply spatially varying separable/2D Gaussian blur simulating a tilted focal plane:
    // Top-Left (u=-1, v=-1) has maximum defocus sigma when `tilt > 0`; Bottom-Right (u=+1, v=+1) stays sharp.
    let mut rng = Rng64::new(0xC011_1A42);
    let black = 512.0f64;
    let span = 16383.0 - black;
    // Camera neutral response reciprocal of AsShotNeutral (0.48, 1.0, 0.62):
    let cam_sens = [0.48f64, 1.0f64, 0.62f64];

    let mut raw = vec![0u16; w * h];
    for y in 0..h {
        let v = (y as f64 / h as f64 - 0.5) * 2.0;
        for x in 0..w {
            let u = (x as f64 / w as f64 - 0.5) * 2.0;
            let r2 = 0.5 * (u * u + v * v);

            // Defocus plane: tilt along (-0.75, -0.66) -> Top-Left collapses, Bottom-Right sharp.
            let plane_offset = tilt * (-0.75 * u - 0.66 * v + 0.65).max(0.0);
            let field_curv = 0.35 * r2;
            let sigma_px = (0.35 + 2.8 * plane_offset + field_curv).clamp(0.3, 5.5);

            let blurred_l = sample_gaussian_2d(&lum, w, h, x, y, sigma_px);
            // Natural lens vignetting (~1.4 EV at extreme corners):
            let vignette = (1.0 - 0.32 * r2).clamp(0.35, 1.0);

            let c_idx = match (x & 1, y & 1) {
                (0, 0) => 0, // R
                (1, 1) => 2, // B
                _ => 1,      // G1 / G2
            };
            let tint = chroma_tint[y * w + x][c_idx] as f64;
            let signal_e = blurred_l * vignette * tint * cam_sens[c_idx] * span;
            let shot_sigma = (signal_e * 0.35 + 4.0).sqrt();
            let adu = (black + signal_e + rng.normal() * shot_sigma)
                .round()
                .clamp(0.0, 16383.0) as u16;
            raw[y * w + x] = adu;
        }
    }

    encode_uncompressed_dng(
        w as u32,
        h as u32,
        &raw,
        &DngSynthMeta {
            make: "Collima Lab",
            model: "Reference 60MP BSI",
            lens_model: if tilt > 0.05 {
                "FE 24mm F1.4 GM (Simulated 0.4deg Mount Tilt)"
            } else {
                "FE 50mm F2 APO-Summicron (Collimated Reference)"
            },
            iso: 100,
            exposure_num: 1,
            exposure_den: 500,
            f_number_tenths: if tilt > 0.05 { 14 } else { 20 },
            focal_mm: if tilt > 0.05 { 24 } else { 50 },
            black_level: [512, 512, 512, 512],
            white_level: 16383,
            cfa_pattern: [0, 1, 1, 2],
        },
    )
}

/// Generate a synthetic 14-bit astrophotography starfield `.DNG` with Top-Right optical tilt.
pub fn generate_starfield_tilt_dng(width: u32, height: u32) -> Vec<u8> {
    let w = (width.clamp(256, 4096) & !1) as usize;
    let h = (height.clamp(256, 4096) & !1) as usize;
    let mut rng = Rng64::new(0xA572_0F1E_1D99);

    let mut sky = vec![0.008f32; w * h];

    // Place ~320 stars across the frame, ensuring every 3x3 station gets rich stellar sampling.
    for s_idx in 0..320 {
        let (cx, cy) = if s_idx < 144 {
            // 16 stars guaranteed in each of the 9 stations
            let st = s_idx / 16;
            let sr = st / 3;
            let sc = st % 3;
            let bx = [0.10, 0.50, 0.90][sc] + (rng.next_f64() - 0.5) * 0.11;
            let by = [0.10, 0.50, 0.90][sr] + (rng.next_f64() - 0.5) * 0.11;
            (bx * w as f64, by * h as f64)
        } else {
            (rng.next_f64() * w as f64, rng.next_f64() * h as f64)
        };

        let u = (cx / w as f64 - 0.5) * 2.0;
        let v = (cy / h as f64 - 0.5) * 2.0;
        // Tilt collapse toward Top-Right (u = +1, v = -1):
        let tilt_defocus = (0.72 * u - 0.68 * v + 0.55).max(0.0);
        let sigma = 0.85 + 2.1 * tilt_defocus;
        let flux = 1.8 + rng.next_f64() * 5.5;

        let rad = (sigma * 4.0).ceil() as isize;
        let ix = cx as isize;
        let iy = cy as isize;
        let norm = 1.0 / (std::f64::consts::TAU * sigma * sigma);

        for dy in -rad..=rad {
            let py = iy + dy;
            if py < 0 || py >= h as isize {
                continue;
            }
            for dx in -rad..=rad {
                let px = ix + dx;
                if px < 0 || px >= w as isize {
                    continue;
                }
                let ddx = px as f64 - cx;
                let ddy = py as f64 - cy;
                let g = norm * (-(ddx * ddx + ddy * ddy) / (2.0 * sigma * sigma)).exp();
                sky[py as usize * w + px as usize] += (flux * g) as f32;
            }
        }
    }

    let black = 512.0f64;
    let span = 16383.0 - black;
    let cam_sens = [0.55f64, 1.0f64, 0.68f64];
    let mut raw = vec![0u16; w * h];

    for y in 0..h {
        for x in 0..w {
            let c_idx = match (x & 1, y & 1) {
                (0, 0) => 0,
                (1, 1) => 2,
                _ => 1,
            };
            let s_val = (sky[y * w + x] as f64).min(0.92) * cam_sens[c_idx] * span;
            let noise = (s_val * 0.25 + 9.0).sqrt();
            raw[y * w + x] = (black + s_val + rng.normal() * noise)
                .round()
                .clamp(0.0, 16383.0) as u16;
        }
    }

    encode_uncompressed_dng(
        w as u32,
        h as u32,
        &raw,
        &DngSynthMeta {
            make: "Collima Astro",
            model: "IMX455 Full-Frame",
            lens_model: "135mm F1.8 Astrograph (TR Tilt Sample)",
            iso: 800,
            exposure_num: 30,
            exposure_den: 1,
            f_number_tenths: 18,
            focal_mm: 135,
            black_level: [512, 512, 512, 512],
            white_level: 16383,
            cfa_pattern: [0, 1, 1, 2],
        },
    )
}

/// Generate a realistic 14-bit Dual-Native-ISO dark frame `.DNG` (HCG gain switch at ISO 800)
/// with slight channel black-level offset and injected hot pixels.
pub fn generate_dark_frame_dng(width: u32, height: u32, iso: u32) -> Vec<u8> {
    let w = (width.clamp(128, 4096) & !1) as usize;
    let h = (height.clamp(128, 4096) & !1) as usize;
    let iso_clamped = iso.clamp(50, 102_400);
    let mut rng = Rng64::new(0xDA2C_0000 ^ (iso_clamped as u64 * 7919));

    // Realistic modern column-ADC BSI Dual-Native-ISO CMOS physics:
    // LCG (< ISO 800): upstream read noise = 2.72 e-, column ADC floor = 0.55 ADU (~2.46 ADU @ ISO 100).
    // HCG (>= ISO 800): upstream read noise drops to 1.02 e-, column ADC floor = 0.50 ADU!
    let gain_adu_per_e = 0.88 * (iso_clamped as f64 / 100.0);
    let (e_read, adc_floor) = if iso_clamped >= 800 {
        (1.02, 0.50)
    } else {
        (2.72, 0.55)
    };
    let base_sigma_adu = ((e_read * gain_adu_per_e).powi(2) + adc_floor * adc_floor).sqrt();

    let black = 512.0f64;
    // Slight realistic per-channel black-level drift & channel gain nuance:
    let ch_offsets = [0.35, 0.05, -0.05, 0.25];
    let ch_sigma_scale = [1.03, 1.00, 1.00, 1.02];

    let mut raw = vec![0u16; w * h];
    for y in 0..h {
        for x in 0..w {
            let ch = match (x & 1, y & 1) {
                (0, 0) => 0,
                (1, 0) => 1,
                (0, 1) => 2,
                _ => 3,
            };
            let mean = black + ch_offsets[ch];
            let sig = base_sigma_adu * ch_sigma_scale[ch];
            let v = (mean + rng.normal() * sig).round().clamp(0.0, 16383.0) as u16;
            raw[y * w + x] = v;
        }
    }

    // Inject ~80 deterministic hot pixels (4000..16383 ADU) across all 4 channels.
    let total = w * h;
    for i in 0..80 {
        let idx = ((rng.next_u64() as usize) ^ (i * 104_729)) % total;
        let amp = 4500 + ((rng.next_u64() % 11_800) as u16);
        raw[idx] = amp.min(16383);
    }

    encode_uncompressed_dng(
        w as u32,
        h as u32,
        &raw,
        &DngSynthMeta {
            make: "Collima SensorLab",
            model: "Dual-Gain 14-bit Reference",
            lens_model: "Body Cap (Dark Bias Frame)",
            iso: iso_clamped,
            exposure_num: 1,
            exposure_den: 8000,
            f_number_tenths: 0,
            focal_mm: 0,
            black_level: [512, 512, 512, 512],
            white_level: 16383,
            cfa_pattern: [0, 1, 1, 2],
        },
    )
}

fn sample_gaussian_2d(src: &[f32], w: usize, h: usize, cx: usize, cy: usize, sigma: f64) -> f64 {
    if sigma <= 0.42 {
        return src[cy * w + cx] as f64;
    }
    let rad = (sigma * 2.4).ceil().min(8.0) as isize;
    let inv_2s2 = 1.0 / (2.0 * sigma * sigma);
    let mut acc = 0.0f64;
    let mut wsum = 0.0f64;

    for dy in -rad..=rad {
        let sy = (cy as isize + dy).clamp(0, (h - 1) as isize) as usize;
        let wy = (-((dy * dy) as f64) * inv_2s2).exp();
        let row = sy * w;
        for dx in -rad..=rad {
            let sx = (cx as isize + dx).clamp(0, (w - 1) as isize) as usize;
            let wx = (-((dx * dx) as f64) * inv_2s2).exp();
            let weight = wx * wy;
            acc += (src[row + sx] as f64) * weight;
            wsum += weight;
        }
    }
    acc / wsum.max(1e-12)
}
