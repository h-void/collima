//! Sensor dark-frame read noise (`sigma_ADU`), black-level drift, hot-pixel rejection,
//! engineering dynamic range (`EV`), and Dual Native ISO inflection detection.
//!
//! Uses an exact O(N) single-pass 65,536-bin `u16` histogram per Bayer channel (`R, G1, G2, B`)
//! to avoid 60MP sorting allocations and prevent integer-quantization collapse at low ISO.

use serde::{Deserialize, Serialize};

use crate::decoder::{CHANNEL_NAMES, DecodedRawImage, MosaicKind, RawImageMetadata};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelNoiseStats {
    pub channel: String,
    pub sample_count: u64,
    pub clean_sample_count: u64,
    pub nominal_black_level: f64,
    pub white_level: f64,
    pub measured_mean: f64,
    pub median_adu: u16,
    pub iqr_adu: u16,
    /// `measured_mean - nominal_black_level`
    pub black_level_offset: f64,
    /// Sample standard deviation (ADU) after iterative 5-sigma hot/dead pixel rejection.
    pub read_noise_adu: f64,
    /// Input-referred shadow noise proxy normalized to ISO 100: `read_noise_adu * (100 / iso)`.
    /// Directly reveals Dual Native ISO High Conversion Gain (HCG) cliff drops!
    pub read_noise_iso100_norm: Option<f64>,
    /// Engineering Dynamic Range (SNR = 1 pixel threshold): `log2((WhiteLevel - BlackLevel) / sigma_ADU)`.
    pub engineering_dr_ev: f64,
    pub hot_pixel_count: u64,
    pub dead_pixel_count: u64,
    pub hot_pixel_ppm: f64,
    pub outlier_low_cutoff: u16,
    pub outlier_high_cutoff: u16,
    pub min_adu: u16,
    pub max_adu: u16,
    /// Percentage of pixels piled up at ADU = 0 (detects firmware negative-noise truncation).
    pub zero_clipped_pct: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DarkFrameReport {
    pub filename: String,
    pub metadata: RawImageMetadata,
    pub iso: u32,
    pub channels: [ChannelNoiseStats; 4],
    /// Mean read noise across the 4 channels (`ADU`).
    pub mean_read_noise_adu: f64,
    /// ISO-100 normalized mean read noise (`ADU @ ISO 100 equivalent`).
    pub mean_read_noise_iso100_norm: Option<f64>,
    /// Mean Engineering Dynamic Range (`EV`) across the 4 channels.
    pub mean_engineering_dr_ev: f64,
    pub mean_black_offset_adu: f64,
    pub total_hot_pixels: u64,
    pub total_hot_pixel_ppm: f64,
    /// Local 16x16 patch sigma (Green channel) to detect large-scale light leaks / vignetting.
    pub local_patch_sigma_g: f64,
    pub is_zero_clipped: bool,
    pub suspected_light_leak: bool,
    /// Compact histogram window `[adu, count]` around the G1 black level for bell-curve inspection.
    pub g1_histogram_window: Vec<[u32; 2]>,
    pub quality_notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DualIsoInflection {
    pub from_iso: u32,
    pub to_iso: u32,
    /// Dynamic range jump relative to the expected `-1 EV/stop` analog ramp, or direct EV rebound.
    pub dr_rebound_ev: f64,
    /// Percentage reduction in ISO-normalized input-referred read noise across the step.
    pub norm_noise_drop_pct: f64,
    pub raw_adu_dropped: bool,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IsoNoiseSeriesReport {
    pub frames: Vec<DarkFrameReport>,
    pub inflections: Vec<DualIsoInflection>,
    pub camera_model: String,
    pub summary: String,
}

/// Analyze dark-frame read noise, black-level offset, hot pixels, and dynamic range across
/// canonical `R, G1, G2, B` channels.
pub fn analyze_noise(img: &DecodedRawImage, filename: &str) -> DarkFrameReport {
    let [ax, ay, aw, ah] = img.active_rect;
    let iso = img.meta.iso.unwrap_or(100).max(1);

    // Heap-allocate four 65,536-bin histograms (4 x 256 KB = 1 MB) to avoid WASM stack pressure.
    let mut hists: [Vec<u32>; 4] = [
        vec![0u32; 65536],
        vec![0u32; 65536],
        vec![0u32; 65536],
        vec![0u32; 65536],
    ];
    let mut counts = [0u64; 4];

    match img.meta.mosaic_kind {
        MosaicKind::Bayer2x2 => {
            let bo = img.bayer_offsets.expect("Bayer2x2 offsets");
            let qw = aw / 2;
            let qh = ah / 2;
            for qy in 0..qh {
                let sy = ay + qy * 2;
                let r_row = (sy + bo.r.1) * img.stride;
                let g1_row = (sy + bo.g1.1) * img.stride;
                let g2_row = (sy + bo.g2.1) * img.stride;
                let b_row = (sy + bo.b.1) * img.stride;
                for qx in 0..qw {
                    let sx = ax + qx * 2;
                    let rv = img.pixels[r_row + sx + bo.r.0] as usize;
                    let g1v = img.pixels[g1_row + sx + bo.g1.0] as usize;
                    let g2v = img.pixels[g2_row + sx + bo.g2.0] as usize;
                    let bv = img.pixels[b_row + sx + bo.b.0] as usize;

                    hists[0][rv] += 1;
                    hists[1][g1v] += 1;
                    hists[2][g2v] += 1;
                    hists[3][bv] += 1;
                }
            }
            let n = (qw * qh) as u64;
            counts = [n, n, n, n];
        }
        MosaicKind::LinearRgb => {
            for y in 0..ah {
                for x in 0..aw {
                    let rv = img.active_sample(x, y, 0) as usize;
                    let gv = img.active_sample(x, y, 1) as usize;
                    let bv = img.active_sample(x, y, 2) as usize;
                    hists[0][rv] += 1;
                    if ((x + y) & 1) == 0 {
                        hists[1][gv] += 1;
                        counts[1] += 1;
                    } else {
                        hists[2][gv] += 1;
                        counts[2] += 1;
                    }
                    hists[3][bv] += 1;
                }
            }
            let n = (aw * ah) as u64;
            counts[0] = n;
            counts[3] = n;
        }
        MosaicKind::XTrans6x6 | MosaicKind::OtherSinglePlane => {
            for y in 0..ah {
                for x in 0..aw {
                    let ch = img.channel_at_active(x, y);
                    let v = img.active_sample(x, y, 0) as usize;
                    hists[ch][v] += 1;
                    counts[ch] += 1;
                }
            }
            // If monochrome (all samples went into G1/G2), mirror into R & B so 4-channel arrays stay populated.
            if counts[0] == 0 && counts[1] > 0 {
                hists[0] = hists[1].clone();
                counts[0] = counts[1];
            }
            if counts[3] == 0 && counts[1] > 0 {
                hists[3] = hists[1].clone();
                counts[3] = counts[1];
            }
            if counts[2] == 0 && counts[1] > 0 {
                hists[2] = hists[1].clone();
                counts[2] = counts[1];
            }
        }
    }

    let has_exif_iso = img.meta.iso.is_some();
    let channels: [ChannelNoiseStats; 4] = std::array::from_fn(|ch| {
        compute_channel_from_histogram(
            CHANNEL_NAMES[ch],
            &hists[ch],
            counts[ch],
            img.black_levels[ch] as f64,
            img.white_levels[ch] as f64,
            if has_exif_iso { Some(iso) } else { None },
        )
    });

    // Extract compact +-40 ADU window around G1 median for Gaussian bell-curve inspection.
    let g1_med = channels[1].median_adu as usize;
    let win_lo = g1_med.saturating_sub(40);
    let win_hi = (g1_med + 40).min(65535);
    let mut g1_histogram_window = Vec::with_capacity(win_hi - win_lo + 1);
    for (adu, &cnt) in hists[1].iter().enumerate().take(win_hi + 1).skip(win_lo) {
        if cnt > 0 || (adu >= g1_med.saturating_sub(12) && adu <= g1_med + 12) {
            g1_histogram_window.push([adu as u32, cnt]);
        }
    }

    let local_patch_sigma_g = estimate_local_patch_sigma(img);

    let mean_read_noise_adu = 0.25 * channels.iter().map(|c| c.read_noise_adu).sum::<f64>();
    let mean_read_noise_iso100_norm = if has_exif_iso {
        Some(mean_read_noise_adu * (100.0 / iso as f64))
    } else {
        None
    };
    let mean_engineering_dr_ev = 0.25 * channels.iter().map(|c| c.engineering_dr_ev).sum::<f64>();
    let mean_black_offset_adu = 0.25 * channels.iter().map(|c| c.black_level_offset).sum::<f64>();
    let total_hot_pixels: u64 = channels.iter().map(|c| c.hot_pixel_count).sum();
    let total_samples: u64 = channels.iter().map(|c| c.sample_count).sum::<u64>().max(1);
    let total_hot_pixel_ppm = (total_hot_pixels as f64 / total_samples as f64) * 1_000_000.0;

    let is_zero_clipped = channels.iter().any(|c| c.zero_clipped_pct >= 0.5);
    let span_ref = (img.white_levels[1] - img.black_levels[1]).max(1.0) as f64;
    let high_signal = channels[1].black_level_offset.abs() > 0.025 * span_ref;
    let spatial_nonuniform =
        local_patch_sigma_g > 0.5 && channels[1].read_noise_adu > 2.2 * local_patch_sigma_g && channels[1].read_noise_adu > 6.0;
    let suspected_light_leak = high_signal || spatial_nonuniform;

    let mut quality_notes = Vec::new();
    if suspected_light_leak {
        quality_notes.push(format!(
            "Suspected light leak or illuminated frame (global G1 σ = {:.2} ADU vs local patch σ = {:.2} ADU, ΔBL = {:+.1} ADU). Capture dark frames with body cap on, viewfinder covered, and 1/4000s+ shutter.",
            channels[1].read_noise_adu, local_patch_sigma_g, channels[1].black_level_offset
        ));
    }
    if is_zero_clipped {
        let max_clip = channels
            .iter()
            .map(|c| c.zero_clipped_pct)
            .fold(0.0f64, f64::max);
        quality_notes.push(format!(
            "Histogram zero-clipping detected ({:.2}% samples at 0 ADU): camera firmware truncates negative black-point noise, which can slightly underestimate σ_ADU and inflate DR.",
            max_clip
        ));
    }
    if let Some(exp) = img.meta.exposure_time_sec {
        if exp >= 0.25 {
            quality_notes.push(format!(
                "Long exposure ({:.2}s): measurements include thermal dark current in addition to readout noise.",
                exp
            ));
        }
    }
    if !has_exif_iso {
        quality_notes.push("EXIF ISO missing; defaulted to ISO 100 for ordering.".to_string());
    }

    DarkFrameReport {
        filename: filename.to_string(),
        metadata: img.meta.clone(),
        iso,
        channels,
        mean_read_noise_adu,
        mean_read_noise_iso100_norm,
        mean_engineering_dr_ev,
        mean_black_offset_adu,
        total_hot_pixels,
        total_hot_pixel_ppm,
        local_patch_sigma_g,
        is_zero_clipped,
        suspected_light_leak,
        g1_histogram_window,
        quality_notes,
    }
}

fn compute_channel_from_histogram(
    name: &str,
    hist: &[u32],
    total: u64,
    nominal_bl: f64,
    white_level: f64,
    iso_opt: Option<u32>,
) -> ChannelNoiseStats {
    if total == 0 {
        return ChannelNoiseStats {
            channel: name.to_string(),
            sample_count: 0,
            clean_sample_count: 0,
            nominal_black_level: nominal_bl,
            white_level,
            measured_mean: nominal_bl,
            median_adu: nominal_bl.round() as u16,
            iqr_adu: 0,
            black_level_offset: 0.0,
            read_noise_adu: 0.0,
            read_noise_iso100_norm: None,
            engineering_dr_ev: 0.0,
            hot_pixel_count: 0,
            dead_pixel_count: 0,
            hot_pixel_ppm: 0.0,
            outlier_low_cutoff: 0,
            outlier_high_cutoff: 65535,
            min_adu: 0,
            max_adu: 0,
            zero_clipped_pct: 0.0,
        };
    }

    let q1_rank = total / 4;
    let med_rank = total / 2;
    let q3_rank = (total * 3) / 4;

    let mut min_adu = 0u16;
    let mut max_adu = 0u16;
    let mut found_min = false;
    let mut q1_adu = 0u16;
    let mut median_adu = 0u16;
    let mut q3_adu = 0u16;
    let mut found_q1 = false;
    let mut found_med = false;
    let mut found_q3 = false;

    let mut cum = 0u64;
    for (v, &cnt) in hist.iter().enumerate() {
        if cnt == 0 {
            continue;
        }
        if !found_min {
            min_adu = v as u16;
            found_min = true;
        }
        max_adu = v as u16;
        cum += cnt as u64;

        if !found_q1 && cum > q1_rank {
            q1_adu = v as u16;
            found_q1 = true;
        }
        if !found_med && cum > med_rank {
            median_adu = v as u16;
            found_med = true;
        }
        if !found_q3 && cum > q3_rank {
            q3_adu = v as u16;
            found_q3 = true;
        }
    }

    let iqr_adu = q3_adu.saturating_sub(q1_adu);
    let sigma_iqr = iqr_adu as f64 / 1.348_979_5;

    // Initial coarse window [median - 128, median + 128] (or 5 * sigma_iqr if wider, e.g. ISO 51200)
    // so ultra-low ISO integer quantization (IQR == 0 or 1) still accurately seeds sigma!
    let seed_radius = (5.0 * sigma_iqr).max(128.0) as usize;
    let (_, seed_sigma, _) = moments_in_range(
        hist,
        (median_adu as usize).saturating_sub(seed_radius),
        (median_adu as usize + seed_radius).min(65535),
    );

    let mut sigma_est = sigma_iqr.max(seed_sigma).max(1.0);
    let center = median_adu as f64;

    // Two passes of 5-sigma clipping with a 6.0 ADU quantization guard floor.
    let mut lo_cut = 0usize;
    let mut hi_cut = 65535usize;
    let mut clean_mean = center;
    let mut clean_sigma = sigma_est;
    let mut clean_n = total;

    for _ in 0..2 {
        let radius = (5.0 * sigma_est).max(6.0);
        lo_cut = (center - radius).floor().max(0.0) as usize;
        hi_cut = (center + radius).ceil().min(65535.0) as usize;
        let (m, s, n) = moments_in_range(hist, lo_cut, hi_cut);
        if n > 1 {
            clean_mean = m;
            clean_sigma = s;
            clean_n = n;
            sigma_est = s.max(1.0);
        }
    }

    let dead_pixel_count: u64 = hist[..lo_cut].iter().map(|&c| c as u64).sum();
    let hot_pixel_count: u64 = if hi_cut < 65535 {
        hist[hi_cut + 1..].iter().map(|&c| c as u64).sum()
    } else {
        0
    };
    let hot_pixel_ppm = (hot_pixel_count as f64 / total as f64) * 1_000_000.0;

    let black_level_offset = clean_mean - nominal_bl;
    let effective_span = (white_level - nominal_bl).max(1.0);
    let engineering_dr_ev = if clean_sigma > 1e-6 {
        (effective_span / clean_sigma).log2().max(0.0)
    } else {
        // Quantization noise floor `1 / sqrt(12) = 0.2887 ADU` upper bound if all pixels are constant.
        (effective_span / 0.288_675).log2().max(0.0)
    };

    let read_noise_iso100_norm = iso_opt.map(|iso| clean_sigma * (100.0 / iso.max(1) as f64));
    let zero_clipped_pct = (hist[0] as f64 / total as f64) * 100.0;

    ChannelNoiseStats {
        channel: name.to_string(),
        sample_count: total,
        clean_sample_count: clean_n,
        nominal_black_level: nominal_bl,
        white_level,
        measured_mean: clean_mean,
        median_adu,
        iqr_adu,
        black_level_offset,
        read_noise_adu: clean_sigma,
        read_noise_iso100_norm,
        engineering_dr_ev,
        hot_pixel_count,
        dead_pixel_count,
        hot_pixel_ppm,
        outlier_low_cutoff: lo_cut as u16,
        outlier_high_cutoff: hi_cut as u16,
        min_adu,
        max_adu,
        zero_clipped_pct,
    }
}

fn moments_in_range(hist: &[u32], lo: usize, hi: usize) -> (f64, f64, u64) {
    let mut n = 0u64;
    let mut sum = 0.0f64;
    for (v, &cnt) in hist.iter().enumerate().take(hi + 1).skip(lo) {
        if cnt > 0 {
            let c = cnt as u64;
            n += c;
            sum += (v as f64) * (c as f64);
        }
    }
    if n == 0 {
        return (0.0, 0.0, 0);
    }
    let mean = sum / n as f64;
    if n == 1 {
        return (mean, 0.0, 1);
    }
    let mut m2 = 0.0f64;
    for (v, &cnt) in hist.iter().enumerate().take(hi + 1).skip(lo) {
        if cnt > 0 {
            let diff = v as f64 - mean;
            m2 += (cnt as f64) * diff * diff;
        }
    }
    let std_dev = (m2 / (n - 1) as f64).sqrt();
    (mean, std_dev, n)
}

/// Sample 25 small 16x16 Green patches distributed across the sensor to measure local temporal
/// read noise free from large-scale spatial illumination gradients.
fn estimate_local_patch_sigma(img: &DecodedRawImage) -> f64 {
    let [ax, ay, aw, ah] = img.active_rect;
    if aw < 64 || ah < 64 {
        return 0.0;
    }
    let g_offset = img.bayer_offsets.map(|b| b.g1).unwrap_or((0, 0));
    let mut patch_sigmas = Vec::with_capacity(25);

    for gy in 0..5 {
        for gx in 0..5 {
            let x0 = (((gx as f32 + 0.5) / 5.0 * aw as f32) as usize)
                .saturating_sub(16)
                .min(aw - 32)
                & !1;
            let y0 = (((gy as f32 + 0.5) / 5.0 * ah as f32) as usize)
                .saturating_sub(16)
                .min(ah - 32)
                & !1;

            let mut vals = Vec::with_capacity(256);
            for r in 0..16 {
                for c in 0..16 {
                    let v = if img.meta.mosaic_kind == MosaicKind::LinearRgb {
                        img.active_sample(x0 + c, y0 + r, 1) as f64
                    } else {
                        let sx = ax + x0 + c * 2 + g_offset.0;
                        let sy = ay + y0 + r * 2 + g_offset.1;
                        if sy < img.buffer_height && sx < img.stride {
                            img.pixels[sy * img.stride + sx] as f64
                        } else {
                            continue;
                        }
                    };
                    vals.push(v);
                }
            }
            if vals.len() >= 32 {
                vals.sort_unstable_by(|a, b| a.total_cmp(b));
                // Trim top/bottom 5% to ignore isolated hot pixels inside the 16x16 patch.
                let trim = vals.len() / 20;
                let slice = &vals[trim..vals.len() - trim];
                let mean = slice.iter().sum::<f64>() / slice.len() as f64;
                let var = slice
                    .iter()
                    .map(|&x| (x - mean) * (x - mean))
                    .sum::<f64>()
                    / (slice.len() - 1).max(1) as f64;
                patch_sigmas.push(var.sqrt());
            }
        }
    }

    if patch_sigmas.is_empty() {
        return 0.0;
    }
    let mid = patch_sigmas.len() / 2;
    patch_sigmas.select_nth_unstable_by(mid, |a, b| a.total_cmp(b));
    patch_sigmas[mid]
}

/// Sort a batch of dark-frame reports by ISO ascending and detect Dual Native ISO / High
/// Conversion Gain (HCG) switch inflection points.
pub fn analyze_iso_series(mut frames: Vec<DarkFrameReport>) -> IsoNoiseSeriesReport {
    frames.sort_by(|a, b| {
        a.iso
            .cmp(&b.iso)
            .then_with(|| a.filename.cmp(&b.filename))
    });

    let camera_model = frames
        .first()
        .map(|f| f.metadata.camera_label.clone())
        .unwrap_or_else(|| "Unknown Camera".to_string());

    // Aggregate duplicate ISOs (if the user dropped multiple dark frames per ISO) for clean inflection detection.
    #[derive(Clone)]
    struct IsoPoint {
        iso: u32,
        sigma_adu: f64,
        norm_sigma: f64,
        dr_ev: f64,
    }

    let mut grouped: Vec<IsoPoint> = Vec::new();
    for f in &frames {
        let norm = f
            .mean_read_noise_iso100_norm
            .unwrap_or(f.mean_read_noise_adu * (100.0 / f.iso.max(1) as f64));
        if let Some(last) = grouped.last_mut().filter(|g| g.iso == f.iso) {
            last.sigma_adu = 0.5 * (last.sigma_adu + f.mean_read_noise_adu);
            last.norm_sigma = 0.5 * (last.norm_sigma + norm);
            last.dr_ev = 0.5 * (last.dr_ev + f.mean_engineering_dr_ev);
        } else {
            grouped.push(IsoPoint {
                iso: f.iso,
                sigma_adu: f.mean_read_noise_adu,
                norm_sigma: norm,
                dr_ev: f.mean_engineering_dr_ev,
            });
        }
    }

    let mut inflections = Vec::new();
    let mut prev_drop_per_stop: Option<f64> = None;

    for pair in grouped.windows(2) {
        let prev = &pair[0];
        let curr = &pair[1];
        if curr.iso <= prev.iso {
            continue;
        }
        let iso_ratio = curr.iso as f64 / prev.iso as f64;
        if iso_ratio > 8.1 || prev.norm_sigma <= 1e-6 {
            prev_drop_per_stop = None;
            continue;
        }

        let stops = iso_ratio.log2().max(0.1);
        let actual_dr_change = curr.dr_ev - prev.dr_ev;
        let dr_rebound_ev = actual_dr_change + stops;
        let norm_drop_pct = ((prev.norm_sigma - curr.norm_sigma) / prev.norm_sigma) * 100.0;
        let curr_drop_per_stop = norm_drop_pct / stops;
        let raw_adu_dropped = curr.sigma_adu < prev.sigma_adu * 0.98;

        // On any single-capacitor PGA + downstream ADC sensor, sigma_ADU strictly increases with ISO,
        // DR strictly decreases, and per-stop normalized-noise improvement strictly decelerates.
        // A true Dual Native ISO / HCG switch either:
        // 1. Directly reduces raw ADU noise or rebounds Engineering DR upward at higher ISO, OR
        // 2. Exhibits a sharp acceleration in per-stop input-referred noise reduction after a prior step
        //    (capturing coarsely sampled series such as ISO 100 -> 400 -> 1600).
        let accelerated_cliff = prev_drop_per_stop
            .map(|p| norm_drop_pct >= 28.0 && curr_drop_per_stop > p + 15.0)
            .unwrap_or(false);

        if raw_adu_dropped || actual_dr_change > 0.05 || accelerated_cliff {
            let desc = format!(
                "Dual Native ISO / HCG switch at ISO {} (from ISO {}): input-referred noise dropped {:.1}%, recovering {:+.2} EV of dynamic range.",
                curr.iso, prev.iso, norm_drop_pct, dr_rebound_ev
            );
            inflections.push(DualIsoInflection {
                from_iso: prev.iso,
                to_iso: curr.iso,
                dr_rebound_ev,
                norm_noise_drop_pct: norm_drop_pct,
                raw_adu_dropped,
                description: desc,
            });
        }

        prev_drop_per_stop = Some(curr_drop_per_stop);
    }

    let summary = if frames.is_empty() {
        "No dark frames loaded.".to_string()
    } else if !inflections.is_empty() {
        let list = inflections
            .iter()
            .map(|i| format!("ISO {}", i.to_iso))
            .collect::<Vec<_>>()
            .join(", ");
        format!(
            "Analyzed {} dark frame(s) for {}: detected Dual/Multi-Gain Conversion switch at {}.",
            frames.len(),
            camera_model,
            list
        )
    } else if grouped.len() >= 3 {
        format!(
            "Analyzed {} dark frame(s) for {} across ISO {}–{}: single-slope analog gain behavior (no HCG jump in sampled range).",
            frames.len(),
            camera_model,
            grouped.first().unwrap().iso,
            grouped.last().unwrap().iso
        )
    } else {
        format!(
            "Analyzed {} dark frame(s) for {}. Add 4+ ISO stops (e.g. ISO 100–6400) to map conversion gain transitions.",
            frames.len(),
            camera_model
        )
    };

    IsoNoiseSeriesReport {
        frames,
        inflections,
        camera_model,
        summary,
    }
}
