import React, { useState, useRef, useImperativeHandle, forwardRef, useEffect } from 'react';
import { Button, ProgressBar, ToastContainer, Toast, Alert } from 'react-bootstrap';
import { getStorage, ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';

const AudioRecorder = forwardRef(({ onRecordingComplete, allowReRecording = false, initialDelay = 0 }, ref) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [playbackUrl, setPlaybackUrl] = useState(null);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastVariant, setToastVariant] = useState('success');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [reRecordingCount, setReRecordingCount] = useState(0);
  const [originalRecordingUrl, setOriginalRecordingUrl] = useState(null);
  const [error, setError] = useState(null);
  const [recordingUrl, setRecordingUrl] = useState(null);
  const [showReRecord, setShowReRecord] = useState(false);

  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);

  useImperativeHandle(ref, () => ({
    startRecording: () => {
      if (!isRecording && !isInitializing) {
        startRecording();
      }
    },
    stopRecording: () => {
      if (isRecording) {
        stopRecording();
      }
    },
    resetRecording: () => {
      resetRecording();
    }
  }));

  // Helper function to write string to DataView
  const writeString = (view, offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  // Helper function to convert Float32Array chunks to WAV
  const convertToWav = (chunks, sampleRate) => {
    const numChannels = 1;
    const format = 1; // PCM
    const bitDepth = 16;
    let totalLength = 0;
    for (const chunk of chunks) {
      totalLength += chunk.length;
    }
    const header = new ArrayBuffer(44);
    const view = new DataView(header);
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + totalLength * 2, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * bitDepth / 8, true);
    view.setUint16(32, numChannels * bitDepth / 8, true);
    view.setUint16(34, bitDepth, true);
    writeString(view, 36, 'data');
    view.setUint32(40, totalLength * 2, true);
    const data = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      data.set(chunk, offset);
      offset += chunk.length;
    }
    const wav = new Int16Array(totalLength);
    for (let i = 0; i < totalLength; i++) {
      wav[i] = Math.max(-1, Math.min(1, data[i])) * 0x7FFF;
    }
    const blob = new Blob([header, wav], { type: 'audio/wav' });
    return blob;
  };

  const startRecording = async () => {
    try {
      setIsInitializing(true);
      setError(null);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
        setIsRecording(false);
      }
      const newStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = newStream;
      // Browser detection
      const userAgent = navigator.userAgent.toLowerCase();
      const isSafari = /^((?!chrome|android).)*safari/i.test(userAgent) &&
        !userAgent.includes('chrome') &&
        !userAgent.includes('crios') &&
        !userAgent.includes('edg');
      if (isSafari) {
        // Use Web Audio API for Safari
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(newStream);
        const processor = audioContext.createScriptProcessor(1024, 1, 1);
        const chunks = [];
        let hasValidAudio = false;
        processor.onaudioprocess = (e) => {
          const inputData = e.inputBuffer.getChannelData(0);
          const hasAudio = inputData.some(sample => Math.abs(sample) > 0.01);
          if (hasAudio) {
            hasValidAudio = true;
            console.log('Safari: Detected audio in chunk');
          }
          chunks.push(new Float32Array(inputData));
        };
        source.connect(processor);
        processor.connect(audioContext.destination);
        mediaRecorderRef.current = {
          context: audioContext,
          source: source,
          processor: processor,
          chunks: chunks,
          hasValidAudio: hasValidAudio,
          stop: () => {
            processor.disconnect();
            source.disconnect();
            audioContext.close();
            console.log('Safari: Stopping recording. Chunks:', chunks.length);
            if (!hasValidAudio) {
              setError('No audio detected in recording');
              setIsRecording(false);
              return;
            }
            const wavBlob = convertToWav(chunks, audioContext.sampleRate);
            console.log('Safari: Final WAV blob size:', wavBlob.size);
            setRecordingUrl(URL.createObjectURL(wavBlob));
            uploadRecording(wavBlob, 'audio/wav');
          }
        };
        await new Promise(resolve => setTimeout(resolve, initialDelay));
        setIsInitializing(false);
        setIsRecording(true);
        console.log('Safari: Started recording');
      } else {
        // Use MediaRecorder for other browsers
        const options = {
          mimeType: 'audio/webm',
          audioBitsPerSecond: 128000
        };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
          options.mimeType = 'audio/mp4';
        }
        const recorder = new MediaRecorder(newStream, options);
        chunksRef.current = [];
        let hasValidAudio = false;
        recorder.ondataavailable = e => {
          console.log('MediaRecorder: ondataavailable', e.data.size, e.data);
          if (e.data.size > 0) {
            chunksRef.current.push(e.data);
            hasValidAudio = true;
          }
        };
        recorder.onstart = () => {
          recorder.requestData();
          console.log('MediaRecorder: Started recording');
        };
        recorder.onstop = async () => {
          const currentChunks = chunksRef.current;
          console.log('MediaRecorder: Stopping recording. Chunks:', currentChunks.length);
          if (currentChunks.length === 0 || !hasValidAudio) {
            setError('No audio detected in recording');
            setIsRecording(false);
            return;
          }
          const blob = new Blob(currentChunks, { type: options.mimeType });
          console.log('MediaRecorder: Final blob size:', blob.size);
          setRecordingUrl(URL.createObjectURL(blob));
          uploadRecording(blob, options.mimeType);
        };
        mediaRecorderRef.current = recorder;
        recorder.start(50);
        await new Promise(resolve => setTimeout(resolve, initialDelay));
        setIsInitializing(false);
        setIsRecording(true);
      }
    } catch (err) {
      setError('Cannot access microphone');
      setIsInitializing(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      if (mediaRecorderRef.current.stop) {
        mediaRecorderRef.current.stop();
      } else if (mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.requestData();
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
    }
  };

  const resetRecording = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    setRecordingUrl(null);
    setShowReRecord(false);
    setIsRecording(false);
    setIsInitializing(false);
    setIsUploading(false);
    setUploadProgress(0);
    setError(null);
    chunksRef.current = [];
  };

  const uploadRecording = async (blob, mimeType) => {
    setIsUploading(true);
    setError(null);
    try {
      const userId = localStorage.getItem('annotationUserId') || (() => {
        const id = crypto.randomUUID();
        localStorage.setItem('annotationUserId', id);
        return id;
      })();
      const ext = mimeType === 'audio/wav' ? 'wav' : 'webm';
      const filename = `recording_${Date.now()}.${ext}`;
      const storage = getStorage();
      const recordingRef = storageRef(storage, `recordings/${userId}/${filename}`);
      const task = uploadBytesResumable(recordingRef, blob);
      task.on('state_changed',
        snap => {
          const progress = (snap.bytesTransferred / snap.totalBytes) * 100;
          setUploadProgress(progress);
        },
        err => {
          setError('Upload failed');
          setIsUploading(false);
        },
        async () => {
          try {
            const url = await getDownloadURL(task.snapshot.ref);
            setRecordingUrl(url);
            setShowReRecord(allowReRecording);
            if (onRecordingComplete) {
              onRecordingComplete(url);
            }
          } catch (err) {
            setError('Error getting download URL');
          } finally {
            setIsUploading(false);
          }
        }
      );
    } catch (err) {
      setError('Upload failed');
      setIsUploading(false);
    }
  };

  const handleReRecording = () => {
    resetRecording();
    startRecording();
  };

  return (
    <div>
      {error && <Alert variant="danger">{error}</Alert>}
      {isInitializing ? (
        <Button variant="secondary" disabled>
          <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
          Initializing...
        </Button>
      ) : isRecording ? (
        <Button variant="danger" onClick={stopRecording}>
          Stop Recording
        </Button>
      ) : recordingUrl ? (
        <div>
          <div style={{ fontWeight: 'bold', marginBottom: 4 }}>Your Recording</div>
          <audio controls src={recordingUrl} style={{ width: '100%' }} />
          {showReRecord && (
            <Button variant="outline-primary" onClick={handleReRecording} className="mt-2">
              Re-record Audio
            </Button>
          )}
        </div>
      ) : (
        <Button variant="primary" onClick={startRecording}>
          Start Recording
        </Button>
      )}
      {isUploading && (
        <div className="mt-2">
          <ProgressBar now={uploadProgress} label={`${Math.round(uploadProgress)}%`} />
        </div>
      )}
    </div>
  );
});

export default AudioRecorder; 