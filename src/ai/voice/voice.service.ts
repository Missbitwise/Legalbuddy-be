import { InferenceClient } from "@huggingface/inference";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

import logger from "../../common/logger";

class VoiceService {
  private hf: InferenceClient;
  private elevenlabs: ElevenLabsClient;

  constructor() {
    const huggingFaceKey = process.env.HUGGINGFACE_API_KEY;
    const elevenLabsKey = process.env.ELEVENLABS_API_KEY;

    if (!huggingFaceKey) {
      logger.warn("HUGGINGFACE_API_KEY is not set.");
    }

    if (!elevenLabsKey) {
      logger.warn("ELEVENLABS_API_KEY is not set.");
    }

    this.hf = new InferenceClient(huggingFaceKey || "");

    this.elevenlabs = new ElevenLabsClient({
      apiKey: elevenLabsKey || "",
    });
  }

  // Audio → Text
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
        {
          type: mimeType,
        },
      );

      const result =
        await this.hf.automaticSpeechRecognition({
          inputs: audioBlob,
          model: "openai/whisper-large-v3",
        });

      const text = result.text?.trim() || "";

      logger.info(
        { text },
        "Voice transcription successful",
      );

      return text;
    } catch (error) {
      logger.error(
        { error },
        "Voice transcription failed",
      );

      throw new Error("Failed to transcribe audio");
    }
  }

  // Text → Audio
  async synthesize(text: string): Promise<Buffer> {
    if (!text || text.trim().length === 0) {
      throw new Error("Text is required for speech synthesis");
    }

    const voiceId = process.env.ELEVENLABS_VOICE_ID;

    if (!voiceId) {
      throw new Error("ELEVENLABS_VOICE_ID is not configured");
    }

    try {
      logger.info(
        { textLength: text.length },
        "Starting speech synthesis",
      );

      const audioStream =
        await this.elevenlabs.textToSpeech.convert(
          voiceId,
          {
            text,
            modelId: "eleven_multilingual_v2",
            outputFormat: "mp3_44100_128",
          },
        );

      const chunks: Buffer[] = [];

      for await (const chunk of audioStream) {
        chunks.push(Buffer.from(chunk));
      }

      const audioBuffer = Buffer.concat(chunks);

      logger.info(
        { bytes: audioBuffer.length },
        "Speech synthesis successful",
      );

      return audioBuffer;
    } catch (error) {
      logger.error(
        { error },
        "Speech synthesis failed",
      );

      throw new Error("Failed to generate speech");
    }
  }
}

export const voiceService = new VoiceService();