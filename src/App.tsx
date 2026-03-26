/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { Upload, Shirt, User, ArrowRight, Loader2, RefreshCw, Download, CheckCircle2, AlertCircle, Sparkles, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";

export default function App() {
  const [personImage, setPersonImage] = useState<File | null>(null);
  const [garmentImage, setGarmentImage] = useState<File | null>(null);
  const [personPreview, setPersonPreview] = useState<string | null>(null);
  const [garmentPreview, setGarmentPreview] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'free' | 'pro'>('free');
  const [loadingStep, setLoadingStep] = useState<string>("");
  const [hasApiKey, setHasApiKey] = useState(false);

  const personInputRef = useRef<HTMLInputElement>(null);
  const garmentInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio?.hasSelectedApiKey) {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(selected);
      }
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    if (window.aistudio?.openSelectKey) {
      await window.aistudio.openSelectKey();
      setHasApiKey(true);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'person' | 'garment') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (type === 'person') {
          setPersonImage(file);
          setPersonPreview(reader.result as string);
        } else {
          setGarmentImage(file);
          setGarmentPreview(reader.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Helper to convert File to base64
  const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleGeminiTryOn = async () => {
    if (!personImage || !garmentImage) return;
    
    setLoadingStep("Analyzing images with Gemini...");
    try {
      // Use the selected API key if available, otherwise fallback to the default Gemini key
      const apiKey = (mode === 'free' && hasApiKey) ? (process.env.API_KEY || process.env.GEMINI_API_KEY) : process.env.GEMINI_API_KEY;
      const ai = new GoogleGenAI({ apiKey: apiKey || "" });

      const personBase64 = (await fileToDataUrl(personImage)).split(',')[1];
      const garmentBase64 = (await fileToDataUrl(garmentImage)).split(',')[1];

      setLoadingStep("Generating virtual try-on result...");
      
      // Use 3.1 if key is selected for better quality, otherwise 2.5
      const modelName = hasApiKey ? "gemini-3.1-flash-image-preview" : "gemini-2.5-flash-image";

      const response = await ai.models.generateContent({
        model: modelName,
        contents: {
          parts: [
            {
              inlineData: {
                data: personBase64,
                mimeType: personImage.type
              }
            },
            {
              inlineData: {
                data: garmentBase64,
                mimeType: garmentImage.type
              }
            },
            {
              text: "Perform a realistic virtual try-on. Take the person in the first image and have them wear the garment shown in the second image. Maintain the person's identity, pose, and background as much as possible while seamlessly integrating the new garment. Output ONLY the resulting image."
            }
          ]
        },
        config: hasApiKey ? {
          imageConfig: {
            aspectRatio: "3:4",
            imageSize: "1K"
          }
        } : undefined
      });

      // Find the image part in the response
      const imagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
      
      if (imagePart?.inlineData?.data) {
        setResultImage(`data:image/png;base64,${imagePart.inlineData.data}`);
      } else {
        // Check if there's text feedback (sometimes models explain why they couldn't generate)
        const textPart = response.candidates?.[0]?.content?.parts?.find(p => p.text);
        throw new Error(textPart?.text || "Gemini failed to generate an image result. Try again with clearer images.");
      }
    } catch (err: any) {
      console.error("Gemini Error:", err);
      if (err.message?.includes("PERMISSION_DENIED") || err.message?.includes("403")) {
        throw new Error("Gemini Permission Denied. Please try selecting a different API key or use Pro Mode.");
      }
      throw new Error(err.message || "Gemini generation failed.");
    }
  };

  const handleReplicateTryOn = async () => {
    const formData = new FormData();
    formData.append('personImage', personImage!);
    formData.append('garmentImage', garmentImage!);

    setLoadingStep("Sending to Replicate GPU...");
    const response = await fetch('/api/try-on', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Failed to process images");
    }

    const data = await response.json();
    setResultImage(data.result);
  };

  const handleSubmit = async () => {
    if (!personImage || !garmentImage) {
      setError("Please upload both images first.");
      return;
    }

    setLoading(true);
    setError(null);
    setResultImage(null);

    try {
      if (mode === 'free') {
        await handleGeminiTryOn();
      } else {
        await handleReplicateTryOn();
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
      setLoadingStep("");
    }
  };

  const reset = () => {
    setPersonImage(null);
    setGarmentImage(null);
    setPersonPreview(null);
    setGarmentPreview(null);
    setResultImage(null);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-[#F5F5F0] text-[#141414] font-sans selection:bg-[#141414] selection:text-[#F5F5F0]">
      {/* Header */}
      <header className="border-b border-[#141414]/10 p-6 flex justify-between items-center bg-white/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <Shirt className="w-6 h-6" />
          <h1 className="text-xl font-bold tracking-tight uppercase">AI Virtual Try-On</h1>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="hidden md:flex bg-gray-100 p-1 rounded-full border border-[#141414]/5">
            <button 
              onClick={() => setMode('free')}
              className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-2 ${mode === 'free' ? 'bg-white shadow-sm text-[#141414]' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <Sparkles className="w-3 h-3" /> Free Mode
            </button>
            <button 
              onClick={() => setMode('pro')}
              className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-2 ${mode === 'pro' ? 'bg-white shadow-sm text-[#141414]' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <Zap className="w-3 h-3" /> Pro Mode
            </button>
          </div>

          <button 
            onClick={reset}
            className="text-xs uppercase tracking-widest font-semibold opacity-50 hover:opacity-100 transition-opacity flex items-center gap-2"
          >
            <RefreshCw className="w-3 h-3" /> Reset
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6 md:p-12">
        {/* Mobile Mode Switcher */}
        <div className="md:hidden mb-8 bg-gray-100 p-1 rounded-xl border border-[#141414]/5 flex">
          <button 
            onClick={() => setMode('free')}
            className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${mode === 'free' ? 'bg-white shadow-sm text-[#141414]' : 'text-gray-400'}`}
          >
            <Sparkles className="w-3 h-3" /> Free
          </button>
          <button 
            onClick={() => setMode('pro')}
            className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${mode === 'pro' ? 'bg-white shadow-sm text-[#141414]' : 'text-gray-400'}`}
          >
            <Zap className="w-3 h-3" /> Pro
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          
          {/* Left Column: Uploads */}
          <div className="space-y-8">
            <section>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-[10px] font-bold bg-[#141414] text-white px-2 py-0.5 rounded-full">01</span>
                <h2 className="text-sm font-bold uppercase tracking-widest">Upload Your Photo</h2>
              </div>
              <div 
                onClick={() => personInputRef.current?.click()}
                className={`relative aspect-[3/4] border-2 border-dashed border-[#141414]/20 rounded-2xl overflow-hidden cursor-pointer group transition-all hover:border-[#141414]/40 ${personPreview ? 'border-none' : ''}`}
              >
                {personPreview ? (
                  <img src={personPreview} alt="Person" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center">
                    <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                      <User className="w-6 h-6 opacity-40" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Click to upload your photo</p>
                      <p className="text-xs opacity-50 mt-1">Full body or upper body works best</p>
                    </div>
                  </div>
                )}
                <input 
                  type="file" 
                  ref={personInputRef} 
                  onChange={(e) => handleFileChange(e, 'person')} 
                  className="hidden" 
                  accept="image/*"
                />
              </div>
            </section>

            <section>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-[10px] font-bold bg-[#141414] text-white px-2 py-0.5 rounded-full">02</span>
                <h2 className="text-sm font-bold uppercase tracking-widest">Upload Garment</h2>
              </div>
              <div 
                onClick={() => garmentInputRef.current?.click()}
                className={`relative aspect-square border-2 border-dashed border-[#141414]/20 rounded-2xl overflow-hidden cursor-pointer group transition-all hover:border-[#141414]/40 ${garmentPreview ? 'border-none' : ''}`}
              >
                {garmentPreview ? (
                  <img src={garmentPreview} alt="Garment" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center">
                    <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                      <Shirt className="w-6 h-6 opacity-40" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Click to upload garment photo</p>
                      <p className="text-xs opacity-50 mt-1">Clear photo of the item on a flat surface</p>
                    </div>
                  </div>
                )}
                <input 
                  type="file" 
                  ref={garmentInputRef} 
                  onChange={(e) => handleFileChange(e, 'garment')} 
                  className="hidden" 
                  accept="image/*"
                />
              </div>
            </section>

            <button
              onClick={handleSubmit}
              disabled={loading || !personImage || !garmentImage}
              className={`w-full py-4 rounded-xl font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-3 ${
                loading || !personImage || !garmentImage 
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed' 
                  : 'bg-[#141414] text-white hover:bg-black hover:scale-[1.02] active:scale-[0.98]'
              }`}
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {loadingStep || "Generating..."}
                </>
              ) : (
                <>
                  {mode === 'free' ? 'Generate (Free)' : 'Generate (Pro)'}
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>

            <div className="p-4 bg-gray-50 rounded-xl border border-[#141414]/5 space-y-4">
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-widest opacity-50">Current Mode</p>
                {mode === 'free' ? (
                  <div className="flex items-start gap-3">
                    <Sparkles className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                    <p className="text-xs leading-relaxed opacity-70">
                      <b>Free Mode (Gemini):</b> Uses built-in AI. Best for quick previews.
                    </p>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <Zap className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                    <p className="text-xs leading-relaxed opacity-70">
                      <b>Pro Mode (Replicate):</b> Uses specialized IDM-VTON models. Requires Replicate API Key.
                    </p>
                  </div>
                )}
              </div>

              {mode === 'free' && (
                <div className="pt-2 border-t border-[#141414]/5">
                  {!hasApiKey ? (
                    <div className="space-y-3">
                      <p className="text-[10px] leading-relaxed opacity-60">
                        Unlock higher quality results by selecting a Gemini API key.
                      </p>
                      <button 
                        onClick={handleSelectKey}
                        className="w-full py-2 bg-white border border-[#141414]/10 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                      >
                        <RefreshCw className="w-3 h-3" /> Select API Key
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-green-600">
                      <CheckCircle2 className="w-3 h-3" />
                      <p className="text-[10px] font-bold uppercase tracking-widest">High Quality Enabled</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {error && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-600"
              >
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-medium">{error}</p>
                  {error.includes("REPLICATE_API_TOKEN") && (
                    <p className="text-xs opacity-70">Go to the <b>Secrets</b> panel in AI Studio and add <code>REPLICATE_API_TOKEN</code>.</p>
                  )}
                </div>
              </motion.div>
            )}
          </div>

          {/* Right Column: Result */}
          <div className="relative">
            <div className="sticky top-32">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-[10px] font-bold bg-[#141414] text-white px-2 py-0.5 rounded-full">03</span>
                <h2 className="text-sm font-bold uppercase tracking-widest">Result</h2>
              </div>
              
              <div className="aspect-[3/4] bg-white rounded-2xl overflow-hidden shadow-2xl shadow-black/5 border border-[#141414]/5 flex items-center justify-center relative">
                <AnimatePresence mode="wait">
                  {loading ? (
                    <motion.div 
                      key="loading"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex flex-col items-center gap-4 p-12 text-center"
                    >
                      <div className="relative">
                        <Loader2 className="w-12 h-12 animate-spin text-[#141414]" />
                        <motion.div 
                          animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                          transition={{ repeat: Infinity, duration: 2 }}
                          className="absolute inset-0 bg-[#141414]/5 rounded-full blur-xl"
                        />
                      </div>
                      <div className="space-y-2">
                        <p className="font-bold uppercase tracking-widest text-xs">Processing AI Model</p>
                        <p className="text-xs opacity-50 max-w-[200px]">This usually takes 20-40 seconds. Please don't close this tab.</p>
                      </div>
                    </motion.div>
                  ) : resultImage ? (
                    <motion.div 
                      key="result"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="w-full h-full relative group"
                    >
                      <img src={resultImage} alt="Result" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      <div className="absolute top-4 right-4 flex gap-2">
                        <a 
                          href={resultImage} 
                          download="try-on-result.png"
                          className="p-3 bg-white/90 backdrop-blur-sm rounded-full shadow-lg hover:bg-white transition-colors"
                        >
                          <Download className="w-5 h-5" />
                        </a>
                      </div>
                      <div className="absolute bottom-6 left-6 right-6 p-4 bg-white/90 backdrop-blur-sm rounded-xl shadow-lg flex items-center gap-3">
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                        <p className="text-xs font-bold uppercase tracking-widest">Generation Complete</p>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div 
                      key="placeholder"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex flex-col items-center gap-4 p-12 text-center opacity-20"
                    >
                      <Shirt className="w-16 h-16" />
                      <p className="text-sm font-medium">Your result will appear here</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="mt-24 border-t border-[#141414]/10 p-12 text-center">
        <p className="text-[10px] uppercase tracking-[0.2em] font-bold opacity-30">
          Powered by {mode === 'free' ? 'Gemini 3.1 Flash' : 'Replicate & IDM-VTON'}
        </p>
      </footer>
    </div>
  );
}
