import { InferenceClient } from "@huggingface/inference";
import { GoogleGenAI } from "@google/genai";

import logger from "../../common/logger";

// Wraps raw PCM (L16) bytes into a valid WAV file buffer
function pcmToWav(
  pcm: Buffer,
  sampleRate = 24000,
  channels = 1,
  bitsPerSample = 16,
): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}

class VoiceService {
  private hf: InferenceClient;
  private genAI: GoogleGenAI;

  constructor() {
    const huggingFaceKey = process.env.HUGGINGFACE_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;

    if (!huggingFaceKey) {
      logger.warn("HUGGINGFACE_API_KEY is not set.");
    }

    if (!geminiKey) {
      logger.warn("GEMINI_API_KEY is not set - TTS will fail.");
    }

    this.hf = new InferenceClient(huggingFaceKey || "");
    this.genAI = new GoogleGenAI({ apiKey: geminiKey || "" });
  }

  // Audio -> Text
  async transcribe(
    audioBuffer: Buffer,
    mimeType = "audio/wav",
  ): Promise<string> {
    if (!audioBuffer || audioBuffer.length === 0) {
      throw new Error("Empty audio buffer received");
    }

    try {
      logger.info(
        { bytes: audioBuffer.length },
        "Starting voice transcription",
      );

      const audioBlob = new Blob(
        [new Uint8Array(audioBuffer)],
        { type: mimeType },
      );

      const result =
        await this.hf.automaticSpeechRecognition({
          inputs: audioBlob,
          model: "openai/whisper-large-v3",
        });

      const text = result.text?.trim() || "";

      logger.info({ text }, "Voice transcription successful");

      return text;
    } catch (error) {
      logger.error({ error }, "Voice transcription failed");
      throw new Error("Failed to transcribe audio");
    }
  }

  // Text -> Audio (Gemini TTS - reuses existing GEMINI_API_KEY)
  async synthesize(text: string): Promise<Buffer> {
    if (!text || text.trim().length === 0) {
      throw new Error("Text is required for speech synthesis");
    }

    try {
      logger.info(
        { textLength: text.length },
        "Starting Gemini TTS speech synthesis",
      );

      const response = await this.genAI.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: "Aoede" },
            },
          },
        },
      });

      const inlineData =
        response.candidates?.[0]?.content?.parts?.[0]?.inlineData;

      if (!inlineData?.data) {
        throw new Error("Gemini TTS returned no audio data");
      }

      // Gemini TTS returns raw PCM (L16, 24 kHz, mono) - wrap in WAV
      const pcm = Buffer.from(inlineData.data, "base64");
      const wav = pcmToWav(pcm);

      logger.info(
        { bytes: wav.length },
        "Gemini TTS speech synthesis successful",
      );

      return wav;
    } catch (error) {
      logger.error({ error }, "Gemini TTS speech synthesis failed");
      throw new Error("Failed to generate speech");
    }
  }
}

export const voiceService = new VoiceService();
