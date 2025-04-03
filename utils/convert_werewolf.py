import os
import subprocess

# Directory containing the original audio files.
AUDIO_DIR = "public/data/audio"

def convert_to_mp3(file_path):
    # Get directory and filename components.
    dir_name, filename = os.path.split(file_path)
    base, ext = os.path.splitext(filename)
    # Create output filename with .mp3 extension.
    output_file = os.path.join(dir_name, f"{base}.mp3")
    
    # ffmpeg command:
    # -y: Overwrite existing files.
    # -i: Input file.
    # -ar 16000: Resample audio to 16kHz.
    # -ac 1: Convert audio to mono.
    # -b:a 64k: Target a bitrate of 64 kbps.
    cmd = [
        "ffmpeg",
        "-y",
        "-i", file_path,
        "-ar", "16000",
        "-ac", "1",
        "-b:a", "64k",
        output_file
    ]
    
    print(f"Converting {file_path} to MP3...")
    try:
        result = subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        print(f"Successfully converted {file_path} to {output_file}")
    except subprocess.CalledProcessError as e:
        print(f"Error converting {file_path}:")
        print(e.stderr.decode())

def main():
    for root, dirs, files in os.walk(AUDIO_DIR):
        for file in files:
            if file.lower().endswith(".wav"):
                full_path = os.path.join(root, file)
                convert_to_mp3(full_path)

if __name__ == "__main__":
    main()