import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Card, Button, ProgressBar, ToastContainer, Toast, Alert } from 'react-bootstrap';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';

function PronunciationTask({ config, data, onUpdate, annotations, initialIndex = 0, onSync }) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isRecording, setIsRecording] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const [playbackUrl, setPlaybackUrl] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastVariant, setToastVariant] = useState('success');
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioError, setAudioError] = useState(null);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);

  // Compute currentRow using useMemo
  const currentRow = useMemo(() => {
    if (!data || data.length === 0) return null;
    return data[currentIndex];
  }, [data, currentIndex]);

  // Get existing annotation or initialize
  const currentAnnotation = useMemo(() => {
    const ann = annotations[currentIndex];
    return ann || { recording: null, metadata: { timestamp: Date.now() } };
  }, [annotations, currentIndex]);
  const { metadata } = currentAnnotation;

  // Load audio URL when current row changes
  useEffect(() => {
    const loadAudioUrl = async () => {
      if (!config.audio || !currentRow?.filename) {
        setAudioUrl(null);
        setAudioError(null);
        setIsLoadingAudio(false);
        return;
      }

      setIsLoadingAudio(true);
      setAudioError(null);
      
      try {
        const storageRef = ref(storage, `audio/${config.id}/${currentRow.filename}`);
        const url = await getDownloadURL(storageRef);
        setAudioUrl(url);
        setAudioError(null);
      } catch (error) {
        console.error('Error loading audio URL:', error);
        setAudioUrl(null);
        if (error.code === 'storage/object-not-found') {
          setAudioError('Reference audio not available');
        } else {
          setAudioError('Error loading audio');
        }
      } finally {
        setIsLoadingAudio(false);
      }
    };
    loadAudioUrl();
  }, [config, currentRow]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  // Reset local state and load persisted recording when row changes
  useEffect(() => {
    // Stop any ongoing recording
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    setIsRecording(false);
    setIsUploading(false);
    setUploadProgress(0);
    // Load persisted recording URL
    setPlaybackUrl(currentAnnotation.recording || null);
  }, [currentIndex, currentAnnotation]);

  if (!currentRow) {
    return <h5>Loading task data...</h5>;
  }

  const startRecording = async () => {
    console.log('Starting recording...');
    const rowIndex = currentIndex;
    const rowMetadata = metadata;
    try {
      setIsInitializing(true);
      // If we're already recording, stop the current recording first
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
        setIsRecording(false);
      }

      const newStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('Microphone access granted');
      
      // Store the stream in ref to prevent garbage collection
      streamRef.current = newStream;
      
      // Comprehensive browser detection
      const userAgent = navigator.userAgent.toLowerCase();
      const isSafari = /^((?!chrome|android).)*safari/i.test(userAgent) && 
                      !userAgent.includes('chrome') &&
                      !userAgent.includes('crios') &&
                      !userAgent.includes('edg');
      
      console.log('Browser detection:', {
        userAgent: navigator.userAgent,
        isSafari: isSafari,
        isEdge: userAgent.includes('edg'),
        isFirefox: userAgent.includes('firefox'),
        isChrome: userAgent.includes('chrome') && !userAgent.includes('edg')
      });
      
      if (isSafari) {
        console.log('Using Web Audio API for Safari');
        // Use Web Audio API for Safari
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(newStream);
        const processor = audioContext.createScriptProcessor(1024, 1, 1);
        const chunks = [];
        let hasValidAudio = false;
        
        processor.onaudioprocess = (e) => {
          const inputData = e.inputBuffer.getChannelData(0);
          // Check if we have actual audio data (not just silence)
          const hasAudio = inputData.some(sample => Math.abs(sample) > 0.01);
          if (hasAudio) {
            hasValidAudio = true;
          }
          chunks.push(new Float32Array(inputData));
        };
        
        source.connect(processor);
        processor.connect(audioContext.destination);
        
        // Store the audio context and processor
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
            
            if (!hasValidAudio) {
              setToastMessage('No audio detected in recording');
              setToastVariant('warning');
              setShowToast(true);
              setIsRecording(false);
              return;
            }
            
            // Convert Float32Array chunks to WAV
            const wavBlob = convertToWav(chunks, audioContext.sampleRate);
            const tempUrl = URL.createObjectURL(wavBlob);
            setPlaybackUrl(tempUrl);
            uploadAudio(wavBlob, rowIndex, rowMetadata);
          }
        };
        
        // Wait a bit longer to ensure recording is initialized
        await new Promise(resolve => setTimeout(resolve, 500));
        setIsInitializing(false);
        setIsRecording(true);
      } else {
        // Use MediaRecorder for other browsers
        const options = {
          mimeType: 'audio/webm',
          audioBitsPerSecond: 128000
        };
        
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
          options.mimeType = 'audio/mp4';
        }
        
        console.log('Using MIME type:', options.mimeType);
        
        const recorder = new MediaRecorder(newStream, options);
        chunksRef.current = [];
        let hasValidAudio = false;
        
        // Request data chunks more frequently (every 50ms)
        recorder.ondataavailable = e => {
          console.log('Data available event:', e.data.size, 'bytes');
          if (e.data.size > 0) {
            chunksRef.current.push(e.data);
            hasValidAudio = true;
          } else {
            console.warn('Received empty data chunk');
          }
        };

        recorder.onstart = () => {
          console.log('Recording started');
          // Start requesting data chunks immediately
          recorder.requestData();
        };

        recorder.onstop = async () => {
          console.log('Recording stopped, chunks:', chunksRef.current.length);
          const currentChunks = chunksRef.current;
          if (currentChunks.length === 0 || !hasValidAudio) {
            setToastMessage('No audio detected in recording');
            setToastVariant('warning');
            setShowToast(true);
            setIsRecording(false);
            return;
          }
          
          const blob = new Blob(currentChunks, { type: options.mimeType });
          const tempUrl = URL.createObjectURL(blob);
          setPlaybackUrl(tempUrl);
          await uploadAudio(blob, rowIndex, rowMetadata);
        };

        mediaRecorderRef.current = recorder;
        
        // Start recording and request data chunks every 50ms
        recorder.start(50);
        
        // Wait a bit longer to ensure recording is initialized
        await new Promise(resolve => setTimeout(resolve, 500));
        setIsInitializing(false);
        setIsRecording(true);
      }
    } catch (err) {
      console.error('Error in startRecording:', err);
      setToastMessage('Cannot access microphone');
      setToastVariant('danger');
      setShowToast(true);
      setIsInitializing(false);
    }
  };

  // Helper function to convert Float32Array chunks to WAV
  const convertToWav = (chunks, sampleRate) => {
    const numChannels = 1;
    const format = 1; // PCM
    const bitDepth = 16;
    
    // Calculate total length
    let totalLength = 0;
    for (const chunk of chunks) {
      totalLength += chunk.length;
    }
    
    // Create WAV header
    const header = new ArrayBuffer(44);
    const view = new DataView(header);
    
    // RIFF chunk descriptor
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + totalLength * 2, true);
    writeString(view, 8, 'WAVE');
    
    // fmt subchunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * bitDepth / 8, true);
    view.setUint16(32, numChannels * bitDepth / 8, true);
    view.setUint16(34, bitDepth, true);
    
    // data subchunk
    writeString(view, 36, 'data');
    view.setUint32(40, totalLength * 2, true);
    
    // Combine header and data
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

  const writeString = (view, offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  const stopRecording = () => {
    console.log('stopRecording called', { isRecording, hasMediaRecorder: !!mediaRecorderRef.current });
    if (mediaRecorderRef.current) {
      if (mediaRecorderRef.current.stop) {
        // For Safari Web Audio API
        mediaRecorderRef.current.stop();
      } else if (mediaRecorderRef.current.state === 'recording') {
        // For MediaRecorder
        mediaRecorderRef.current.requestData(); // Get final chunk
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
    }
  };

  const uploadAudio = async (blob, rowIndex, rowMetadata) => {
    setIsUploading(true);
    setToastMessage('Uploading recording...');
    setToastVariant('info');
    setShowToast(true);

    try {
      // Log storage configuration for debugging
      console.log('Storage configuration:', {
        bucket: storage.bucket,
        app: storage.app.name,
        projectId: storage.app.options.projectId
      });

      const userId = localStorage.getItem('annotationUserId') || (() => {
        const id = crypto.randomUUID();
        localStorage.setItem('annotationUserId', id);
        return id;
      })();

      const filename = `pronunciation_${data[rowIndex].word}_${Date.now()}.wav`;
      const storageRef = ref(storage, `recordings/${userId}/${filename}`);
      
      // Log the storage reference for debugging
      console.log('Storage reference:', {
        path: storageRef.fullPath,
        bucket: storageRef.bucket
      });

      const task = uploadBytesResumable(storageRef, blob);

      task.on('state_changed',
        snap => {
          const progress = (snap.bytesTransferred / snap.totalBytes) * 100;
          setUploadProgress(progress);
        },
        err => {
          console.error('Upload error:', err);
          setToastMessage(`Upload failed: ${err.message}`);
          setToastVariant('danger');
          setShowToast(true);
          setIsUploading(false);
        },
        async () => {
          try {
            const url = await getDownloadURL(task.snapshot.ref);
            await onUpdate(rowIndex, { recording: url, metadata: { ...rowMetadata, timestamp: Date.now() } });
            setPlaybackUrl(url);
            setToastMessage('Recording saved');
            setToastVariant('success');
            setShowToast(true);
          } catch (err) {
            console.error('Error getting download URL:', err);
            setToastMessage(`Error saving recording: ${err.message}`);
            setToastVariant('danger');
            setShowToast(true);
          } finally {
            setIsUploading(false);
          }
        }
      );
    } catch (err) {
      console.error('Error in uploadAudio:', err);
      setToastMessage(`Upload failed: ${err.message}`);
      setToastVariant('danger');
      setShowToast(true);
      setIsUploading(false);
    }
  };

  const goPrev = async () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const goNext = async () => {
    if (currentIndex < data.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  return (
    <Card className="mb-3">
      <Card.Header>
        <h5>Pronunciation Task - Row {currentIndex + 1} of {data.length}</h5>
      </Card.Header>
      <Card.Body>
        <p className="text-muted mb-3">{config.description}</p>

        {/* Word and OED information */}
        <div className="mb-3">
          <h6>Word to Pronounce:</h6>
          <p className="lead">{currentRow.word}</p>
          {currentRow.OED && (
            <div className="mb-2">
              <h6>OED Entry:</h6>
              <p>{currentRow.OED}</p>
            </div>
          )}
          {currentRow.region && (
            <div className="mb-2">
              <h6>Region:</h6>
              <p>{currentRow.region}</p>
            </div>
          )}
        </div>

        {/* Reference audio */}
        {config.audio && currentRow?.filename && (
          <div className="mb-3">
            <p><strong>Reference Audio:</strong></p>
            {isLoadingAudio ? (
              <div className="text-muted">Loading audio...</div>
            ) : audioError ? (
              <Alert variant="warning">{audioError}</Alert>
            ) : audioUrl ? (
              <audio controls style={{ width: '100%' }}>
                <source src={audioUrl} type="audio/wav" />
                Your browser does not support audio.
              </audio>
            ) : null}
          </div>
        )}

        {/* Recording controls */}
        {config.recording && (
          <div className="mb-3">
            {isInitializing ? (
              <Button variant="secondary" disabled style={{ minWidth: 160 }}>
                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                Initializing…
              </Button>
            ) : (
              <Button
                variant={isRecording ? 'danger' : 'primary'}
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isUploading}
                style={{ minWidth: 160 }}
              >
                {isRecording ? 'Stop Recording' : (playbackUrl ? 'Re-record Audio' : 'Start Recording')}
              </Button>
            )}

            {isUploading && (
              <div className="mt-2">
                <ProgressBar now={uploadProgress} label={`${Math.round(uploadProgress)}%`} />
              </div>
            )}

            {playbackUrl && !isUploading && (
              <div className="mt-2">
                <p><strong>Your Recording:</strong></p>
                <audio controls src={playbackUrl} style={{ width: '100%' }} />
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="d-flex justify-content-center mt-4">
          <Button variant="secondary" onClick={goPrev} disabled={currentIndex === 0}>Previous</Button>
          <span className="mx-3">{currentIndex + 1}/{data.length}</span>
          <Button variant="secondary" onClick={goNext} disabled={currentIndex === data.length - 1}>Next</Button>
        </div>

        {/* Toasts */}
        <ToastContainer position="top-end" className="p-3">
          <Toast show={showToast} onClose={() => setShowToast(false)} delay={3000} autohide bg={toastVariant}>
            <Toast.Header><strong className="me-auto">Notification</strong></Toast.Header>
            <Toast.Body>{toastMessage}</Toast.Body>
          </Toast>
        </ToastContainer>
      </Card.Body>
    </Card>
  );
}

export default PronunciationTask;