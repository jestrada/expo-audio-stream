// net/siteed/audiostream/AudioAnalysisData.kt
package net.siteed.audiostream

import android.os.Bundle
import androidx.core.os.bundleOf

data class DataPoint(
    val id: Long,
    val amplitude: Float,
    val activeSpeech: Boolean? = null,
    val dB: Float? = null,
    val silent: Boolean? = null,
    val features: Features? = null,
    val timestamp: Float? = null,
    val speaker: Int? = null
) {
    fun toDictionary(): Map<String, Any?> {
        return mapOf(
            "id" to id,
            "amplitude" to amplitude,
            "activeSpeech" to activeSpeech,
            "dB" to dB,
            "silent" to silent,
            "features" to features?.toDictionary(),
            "timestamp" to timestamp,
            "speaker" to speaker
        )
    }

    fun toBundle(): Bundle {
        return bundleOf(
            "id" to id,
            "amplitude" to amplitude,
            "activeSpeech" to activeSpeech,
            "dB" to dB,
            "silent" to silent,
            "features" to features?.toBundle(),
            "timestamp" to timestamp,
            "speaker" to speaker
        )
    }
}

data class AudioAnalysisData(
    val pointsPerSecond: Int,
    val durationMs: Int,
    val bitDepth: Int,
    val numberOfChannels: Int,
    val sampleRate: Int,
    val dataPoints: List<DataPoint>,
    val amplitudeRange: AmplitudeRange,
    val speakerChanges: List<SpeakerChange>,
    val extractionTimeMs: Float
) {
    data class AmplitudeRange(val min: Float, val max: Float) {
        fun toDictionary(): Map<String, Float> {
            return mapOf("min" to min, "max" to max)
        }

        fun toBundle(): Bundle {
            return bundleOf("min" to min, "max" to max)
        }
    }

    data class SpeakerChange(val timestamp: Float, val speaker: Int) {
        fun toDictionary(): Map<String, Any> {
            return mapOf("timestamp" to timestamp, "speaker" to speaker)
        }

        fun toBundle(): Bundle {
            return bundleOf("timestamp" to timestamp, "speaker" to speaker)
        }
    }

    fun toDictionary(): Map<String, Any> {
        return mapOf(
            "pointsPerSecond" to pointsPerSecond,
            "durationMs" to durationMs,
            "bitDepth" to bitDepth,
            "numberOfChannels" to numberOfChannels,
            "sampleRate" to sampleRate,
            "dataPoints" to dataPoints.map { it.toDictionary() },
            "amplitudeRange" to amplitudeRange.toDictionary(),
            "speakerChanges" to speakerChanges.map { it.toDictionary() },
            "extractionTimeMs" to extractionTimeMs
        )
    }

    fun toBundle(): Bundle {
        val dataPointsBundleArray = dataPoints.map { it.toBundle() }.toTypedArray()
        val speakerChangesBundleArray = speakerChanges.map { it.toBundle() }.toTypedArray()

        return bundleOf(
            "pointsPerSecond" to pointsPerSecond,
            "durationMs" to durationMs,
            "bitDepth" to bitDepth,
            "numberOfChannels" to numberOfChannels,
            "sampleRate" to sampleRate,
            "dataPoints" to dataPointsBundleArray,
            "amplitudeRange" to amplitudeRange.toBundle(),
            "speakerChanges" to speakerChangesBundleArray,
            "extractionTimeMs" to extractionTimeMs
        )
    }
}