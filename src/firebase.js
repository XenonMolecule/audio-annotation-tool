import { initializeApp } from 'firebase/app';
import { getStorage } from 'firebase/storage';

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
    authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
    storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.REACT_APP_FIREBASE_APP_ID
};

// Validate required configuration
const requiredConfig = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'appId'];
const missingConfig = requiredConfig.filter(key => !firebaseConfig[key]);

if (missingConfig.length > 0) {
    console.error('Missing required Firebase configuration:', missingConfig);
    throw new Error(`Missing required Firebase configuration: ${missingConfig.join(', ')}`);
}

// Initialize Firebase
let app;
try {
    app = initializeApp(firebaseConfig);
    console.log('Firebase initialized successfully:', {
        projectId: app.options.projectId,
        storageBucket: app.options.storageBucket
    });
} catch (error) {
    console.error('Error initializing Firebase:', error);
    throw error;
}

// Get a reference to the storage service
let storage;
try {
    storage = getStorage(app);
    console.log('Firebase Storage initialized successfully');
} catch (error) {
    console.error('Error initializing Firebase Storage:', error);
    throw error;
}

export { storage }; 