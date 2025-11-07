# State-of-the-Art Small Language Model Benchmark Results

## Metrics
**Parameters**: Parameter count of model  
**Size (MB)**: Size of the GGUF-format model file, in MB  
**Load Time (s)**: Time it takes for model to be loaded into memory, in seconds  
**Avg TTFT (ms)**: Time it takes for model to generate first token in response, averaged across all test promts, in milliseconds  
**Avg Speed (t/s)**: How quickly model can generate response tokens, averaged across all test prompts, in tokens per second  
**Avg Memory (MB)**: How much memory the model consumes at its peak (during inference), averaged across all test prompts, in MB  

## Results
*Note: All models are run with llama.cpp backend.*  
| Model | Parameters | Size | Load Time | Avg TTFT | Avg Speed | Avg Memory |
|-------|------------|-----------|---------------|---------------|-----------------|-----------------|
| MobileLLM-125M | 125M | 273.65 MB | 0.76 s | 26 ms | 102.48 t/s | 319 MB |
| MiniCPM-S-1B | 1B | 2811.55 MB | 5.24 s | 365 ms | 12.52 t/s | 3039 MB |
| TinyLlama-1.1B | 1.1B | 2099.06 MB | 5.68 s | 89 ms | 14.06 t/s | 2144 MB |
| LLaVa-Phi2-3B (Q4_K_M) | 3B | 1657.14 MB | 4.78 s | 128 ms | 14.82 t/s | 3367 MB |
| Phi-4-mini-instruct (Q4_K_M) | 4B | 2376.44 MB | 5.00 s | 164 ms | 10.65 t/s | 3836 MB |
| Qwen2.5-7B-Instruct-1M (Q4_K_M) | 7B | 4466.13 MB | 14.66 s | 385 ms | 6.18 t/s | 7192 MB |
| Gemma-3n-E4B (Q4_K_M) | 8B (Effectively 4B) | 4328.78 MB | 8.34 s | 231 ms | 8.03 t/s | 6483 MB |
| Phi-4 (Q3_K_S) | 15B | 6203.41 MB | 17.28 s | 837 ms | 3.13 t/s | 6638 MB |
