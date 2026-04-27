import { GoogleGenAI } from '@google/genai';
import fs from 'fs';

const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey });

async function run() {
  try {
    // We need a dummy image base64 first. Let's just create a small red square
    const dummyImageStr = "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FAP5zBQpe9yYtAAAAAElFTkSuQmCC";

    console.log('Testing generateImages BKG_REMOVAL with empty prompt...');
    const response = await ai.models.generateImages({
      model: 'imagen-4.0-fast-generate-001',
      prompt: '',
      config: {
        numberOfImages: 1,
        outputMimeType: 'image/png',
        sourceImage: {
          imageBytes: dummyImageStr,
          mimeType: 'image/png'
        },
        editConfig: {
          editMode: 'BKG_REMOVAL'
        }
      }
    });
    console.log('SUCCESS! Generated image bytes length:', response?.generatedImages?.[0]?.image?.imageBytes?.length);
  } catch (err) {
    console.error('Error with empty prompt:', err.message);
  }

  try {
    console.log('\nTesting generateImages BKG_REMOVAL with space prompt " "...');
    const response2 = await ai.models.generateImages({
      model: 'imagen-4.0-fast-generate-001',
      prompt: ' ',
      config: {
        numberOfImages: 1,
        outputMimeType: 'image/png',
        sourceImage: {
          imageBytes: dummyImageStr,
          mimeType: 'image/png'
        },
        editConfig: {
          editMode: 'BKG_REMOVAL'
        }
      }
    });
    console.log('SUCCESS! Generated image bytes length:', response2?.generatedImages?.[0]?.image?.imageBytes?.length);
  } catch (err) {
    console.error('Error with space prompt:', err.message);
  }
}
run();
