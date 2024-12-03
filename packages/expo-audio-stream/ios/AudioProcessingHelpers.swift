// AudioProcessingHelpers.swift

import os
import Accelerate


let LOG_BASE: Double = 10.0
let MEL_MAX_FREQ_CONSTANT: Double = 700.0
let MEL_MAX_FREQ_DIVISOR: Double = 2595.0
let MEL_MIN_FREQ: Double = 0.0
let NUM_MEL_FILTERS: Int = 26
let NUM_MFCC_COEFFICIENTS: Int = 13
let DCT_SQRT_DIVISOR: Double = 2.0

// Define a logger with subsystem and category for this module
let logger: Logger = Logger(subsystem: "com.deeeed.expo-audio-stream", category: "AudioProcessingHelpers")

enum DCTComputationError: Error {
  case emptyLogEnergies
  case invalidNumCoefficients(String)
}


func extractMFCC(from segment: [Float], sampleRate: Float) -> [Float] {
    // Placeholder for MFCC extraction logic
    if segment.count < 2 {
      logger.debug("Segment data is too small for MFCC extraction, size=\(segment.count)")
      return []
    }

    var fftData = segment
    let fft = FFT(n: fftData.count)
    fft.realForward(data: &fftData)


    let squaredFFTData = fftData.map {$0 * $0}
    if squaredFFTData.count % 2 != 0 {
      logger.debug("FFT Data size is not even; cannot compute power spectrum")
      return []
    }

    // Compute the power spectrum
    let powerSpectrum: [Float] = stride(from: 0, to: squaredFFTData.count, by: 2).map { i -> Float in
      let reSquared: Float = squaredFFTData[i]
      let imSquared: Float = squaredFFTData[i + 1]
      return sqrt(reSquared + imSquared)
    }

    // Compute Mel filter bank
    let melFilterBank: [[Float]] = computeMelFilterBank(numFilters: NUM_MEL_FILTERS, powerSpectrumSize: powerSpectrum.count, sampleRate: sampleRate)
    let filterEnergies: [Float] = melFilterBank.map{ filter in 
      let zipped: Zip2Sequence<[Float], [Float]> = zip(filter, powerSpectrum)
      let sum: Double = zipped.map{ (f: Float, p: Float) in Double(f*p) }.reduce(0, +)
      return Float(sum)
    }

    // NOT NaN
    // return filterEnergies

    // Apply log to filter energies
    let logEnergies: [Float] = filterEnergies.map { log($0 + Float.leastNonzeroMagnitude) }

    return logEnergies

    // Compute Discrete Cosine Transform (DCT) of log energies to get MFCCs
    do {
        return try computeDCT(logEnergies: logEnergies, numCoefficients: NUM_MFCC_COEFFICIENTS)
    } catch {
        logger.debug("Error computing DCT, error=\(error)")
        return []
    }
}

/// Computes the Mel filter bank.
/// - Parameters:
///   - numFilters: The number of Mel filters.
///   - powerSpectrumSize: The size of the power spectrum.
///   - sampleRate: The sample rate of the audio data.
/// - Returns: A list of Mel filters.
private func computeMelFilterBank(numFilters: Int, powerSpectrumSize: Int, sampleRate: Float) -> [[Float]] {
  var melFilters: [[Float]] = []

  let melMaxFreq: Double = MEL_MAX_FREQ_DIVISOR * log10(1.0 + Double(sampleRate) / 2.0 / MEL_MAX_FREQ_CONSTANT)
  let melPoints: [Double] = Array(0...numFilters + 1).map { i in 
    let freqDiff: Double = Double(melMaxFreq) - MEL_MIN_FREQ
    let filterStep: Double = Double(numFilters + 1)
    let increment: Double = Double(i) * freqDiff / filterStep
    return MEL_MIN_FREQ + increment
  }

  let hzPoints: [Double] = melPoints.map { MEL_MAX_FREQ_CONSTANT * pow(LOG_BASE, $0 / MEL_MAX_FREQ_DIVISOR) - 1.0 }
  let bin: [Double] = hzPoints.map { $0 * Double(powerSpectrumSize - 1) / Double(sampleRate) } 

  for i: Int in 1...numFilters {
    // Should a guard be here?
    // guard i + 1 < bin.count else { break }
    var filter: [Float] = Array(repeating: Float(0), count: powerSpectrumSize)
    for j: Int in Int(bin[i - 1])..<Int(bin[i]) where j >= 0 && j < filter.count {
      filter[j] = Float((Double(j) - bin[i - 1]) / (bin[i] - bin[i - 1]))
    }

    for j: Int in Int(bin[i])..<Int(bin[i + 1]) where j >= 0 && j < filter.count {
      filter[j] = Float((bin[i + 1]  - Double(j)) / (bin[i + 1] - bin[i]))
    }
    melFilters.append(filter)
  }

  return melFilters
}

/// Computes the Discrete Cosine Transform (DCT) of the log energies.
/// - Parameters:
///   - logEnergies: The log energies.
///   - numCoefficients: The number of coefficients to compute.
/// - Returns: An array of MFCC coefficients.
private func computeDCT(logEnergies: [Float], numCoefficients: Int) throws -> [Float] {
  guard !logEnergies.isEmpty else {
    throw DCTComputationError.emptyLogEnergies
  }

  guard numCoefficients > 0 else {
    throw DCTComputationError.invalidNumCoefficients("numCoefficients must be greater than zero.")
  }

  guard numCoefficients <= logEnergies.count else {
    throw DCTComputationError.invalidNumCoefficients("numCoefficients must be less than or equal to the number of log energies.")
  }

  let n: Double = Double(logEnergies.count)
  var dct: [Float] = Array(repeating: Float(0), count: numCoefficients)
  for i: Int in 0..<numCoefficients {
    var sum: Double = 0.0
    for j: Int in 0..<logEnergies.count {
      let logEnergy: Double = Double(logEnergies[j])
      let iD: Double = Double(i) 
      let jD: Double = Double(j)
      let cosineTerm: Double = cos(.pi * iD * (jD + 0.5) / n)
      sum += logEnergy * cosineTerm 
    }
    dct[i] = Float(sum / sqrt(DCT_SQRT_DIVISOR * n))
  }

  return dct
}

func extractSpectralCentroid(from segment: [Float], sampleRate: Float) -> Float {
    logger.debug("Extracting Spectral Centroid from segment of length \(segment.count)")
    // return 0.0 // TODO: Implement spectral centroid extraction logic
    return 2.5 // TODO: Implement spectral centroid extraction logic
}

func extractSpectralFlatness(from segment: [Float]) -> Float {
    logger.debug("Extracting Spectral Flatness from segment of length \(segment.count)")
    
    var mean: Float = 0.0
    var geometricMean: Float = 1.0
    let count = vDSP_Length(segment.count)
    
    vDSP_meamgv(segment, 1, &mean, count)
    
    var sumLogValues: Float = 0.0
    for value in segment {
        let adjustedValue = max(value, 1e-10)
        sumLogValues += log(adjustedValue)
    }
    geometricMean = exp(sumLogValues / Float(count))
    
    let spectralFlatness = mean > 0 ? geometricMean / mean : 0.0
    logger.debug("Spectral Flatness: \(spectralFlatness)")
    return spectralFlatness
}

func extractSpectralRollOff(from segment: [Float], sampleRate: Float) -> Float {
    // Implement spectral roll-off extraction logic
    return 0.0
}

func extractSpectralBandwidth(from segment: [Float], sampleRate: Float) -> Float {
    // Implement spectral bandwidth extraction logic
    return 0.0
}

func extractChromagram(from segment: [Float], sampleRate: Float) -> [Float] {
    // Implement chromagram extraction logic
    return []
}

func extractTempo(from segment: [Float], sampleRate: Float) -> Float {
    // Implement tempo extraction logic
    return 0.0
}

func extractHNR(from segment: [Float]) -> Float {
    // Implement harmonic-to-noise ratio extraction logic
    return 0.0
}
