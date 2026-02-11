declare module 'whisper.rn' {
  export function initWhisper(options: {
    filePath: string;
  }): Promise<WhisperContext>;

  export function initWhisperVad(options: {
    filePath: string;
  }): Promise<any>;

  export interface WhisperContext {
    transcribe(
      audioPath: string,
      options?: { language?: string }
    ): { promise: Promise<{ result: string }> };
    release(): Promise<void>;
  }
}