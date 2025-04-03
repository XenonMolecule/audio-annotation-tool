import os
import json
import numpy as np
import soundfile as sf
from pyannote.audio import Pipeline
import whisper
from tqdm import tqdm
import librosa

# Initialize the diarization pipeline.
# If you need a Hugging Face token, set the environment variable HUGGINGFACE_TOKEN.
diarization_pipeline = Pipeline.from_pretrained("pyannote/speaker-diarization")

# Load the Whisper ASR model.
whisper_model = whisper.load_model("base")

def transcribe_segment(audio_segment, sr):
    """
    Transcribe a numpy array audio segment using Whisper.
    Resample to 16000 Hz and ensure mono audio as needed.
    """
    if audio_segment.ndim > 1:
        audio_segment = np.mean(audio_segment, axis=1)
    
    # Resample to 16000 if needed.
    if sr != 16000:
        audio_segment = librosa.resample(audio_segment, orig_sr=sr, target_sr=16000)
        sr = 16000
    
    audio_segment = np.array(audio_segment, dtype=np.float32)
    if np.max(np.abs(audio_segment)) > 1.0:
        audio_segment = audio_segment / np.max(np.abs(audio_segment))
    
    result = whisper_model.transcribe(audio_segment, fp16=False)
    return result["text"].strip()

def process_audio(audio_path):
    # Read the full audio file.
    audio, sr = sf.read(audio_path)
    
    # Run speaker diarization.
    diarization = diarization_pipeline(audio_path)
    
    transcript_parts = []
    # Iterate over segments with speaker labels.
    for segment, _, speaker in diarization.itertracks(yield_label=True):
        start, end = segment.start, segment.end
        start_idx = int(start * sr)
        end_idx = int(end * sr)
        segment_audio = audio[start_idx:end_idx]
        try:
            seg_transcript = transcribe_segment(segment_audio, sr)
        except Exception as e:
            print(f"Error transcribing segment {start:.2f}-{end:.2f} in {audio_path}: {e}")
            seg_transcript = "[Transcription error]"
        transcript_parts.append(f"[{speaker}] {seg_transcript}")
    
    full_transcript = " ".join(transcript_parts)
    return full_transcript if full_transcript.strip() else "[No transcript available]"

def main():
    dataset_path = "public/data/werewolf.jsonl"
    transcript_path = "public/data/werewolf_transcripts.jsonl"

    # Load existing transcripts if available.
    existing_transcripts = {}
    if os.path.exists(transcript_path):
        with open(transcript_path, "r", encoding="utf-8") as f:
            for line in f:
                try:
                    row = json.loads(line)
                    if "filename" in row and "transcript" in row:
                        existing_transcripts[row["filename"]] = row["transcript"]
                except Exception as e:
                    print("Error reading a line from existing transcripts:", e)

    # Read all lines from the dataset.
    with open(dataset_path, "r", encoding="utf-8") as f:
        lines = [line for line in f if line.strip()]

    output_rows = []
    # Use tqdm to wrap the iteration for progress indication.
    for line in tqdm(lines, desc="Processing audio files", unit="file"):
        try:
            row = json.loads(line)
        except json.JSONDecodeError as e:
            print("Skipping invalid JSON line:", e)
            continue

        filename = row.get("filename")
        if not filename:
            continue

        if filename in existing_transcripts and existing_transcripts[filename]:
            row["transcript"] = existing_transcripts[filename]
        else:
            audio_path = os.path.join("public", "data", "audio", filename)
            if os.path.exists(audio_path):
                transcript = process_audio(audio_path)
                row["transcript"] = transcript
            else:
                row["transcript"] = "[Auto-generated transcript not available]"

        output_rows.append(row)

    with open(transcript_path, "w", encoding="utf-8") as f:
        for row in output_rows:
            f.write(json.dumps(row) + "\n")

    print(f"Done! Transcripts saved to {transcript_path}")

if __name__ == "__main__":
    main()