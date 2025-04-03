import os
import json
from tqdm import tqdm
import assemblyai as aai

# Set your AssemblyAI API key here.
aai.settings.api_key = "API_KEY_HERE"

def process_audio(audio_path):
    """
    Transcribe a local audio file using AssemblyAI with speaker labels.
    """
    # Configure transcription settings.
    config = aai.TranscriptionConfig(
        speech_model=aai.SpeechModel.best,
        speaker_labels=True,
        language_code="en_us"
    )
    transcriber = aai.Transcriber(config=config)
    transcript = transcriber.transcribe(audio_path)
    
    if transcript.status == aai.TranscriptStatus.error:
        return f"[Error: {transcript.error}]"
    
    diarized_text = [f"[SPEAKER_{utterance.speaker}]: {utterance.text}" for utterance in transcript.utterances]
    diarized_text = " ".join(diarized_text)

    return diarized_text

def main():
    dataset_path = "public/data/werewolf.jsonl"
    transcript_path = "public/data/werewolf_transcripts.jsonl"

    # Load any existing transcripts.
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
    # Process each file with a progress bar.
    for i, line in enumerate(tqdm(lines, desc="Processing audio files", unit="file")):
        try:
            row = json.loads(line)
        except json.JSONDecodeError as e:
            print("Skipping invalid JSON line:", e)
            continue

        filename = row.get("filename")
        if not filename:
            continue

        # Use cached transcript if available.
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

        # Every 2 files, update the transcript file.
        if (i + 1) % 2 == 0:
            with open(transcript_path, "w", encoding="utf-8") as f:
                for out_row in output_rows:
                    f.write(json.dumps(out_row) + "\n")
            print(f"Updated transcripts after processing {i + 1} files.")

    # Final write.
    with open(transcript_path, "w", encoding="utf-8") as f:
        for row in output_rows:
            f.write(json.dumps(row) + "\n")
    print(f"Done! Transcripts saved to {transcript_path}")

if __name__ == "__main__":
    main()