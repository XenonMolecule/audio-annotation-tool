import soundfile as sf
from datasets import load_dataset

# Load the "train" split of the dataset (adjust if needed)
ds = load_dataset("WillHeld/werewolf", split="train")

for i, example in enumerate(ds):
    audio_info = example["audio"]
    audio_array = audio_info["array"]
    sampling_rate = audio_info["sampling_rate"]
    
    # Save to a .wav file (0.wav, 1.wav, 2.wav, etc.)
    sf.write(f"../public/data/audio/{i}.wav", audio_array, sampling_rate)

print("Done! Saved all audio files as 0.wav, 1.wav, 2.wav, etc.")