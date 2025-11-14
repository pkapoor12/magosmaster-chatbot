# State-of-the-Art Small Language Model Benchmark Results

## Resource Benchmark

### Metrics
**Parameters**: Parameter count of model  
**Size (MB)**: Size of the GGUF-format model file, in MB  
**Load Time (s)**: Time it takes for model to be loaded into memory, in seconds  
**Avg TTFT (ms)**: Time it takes for model to generate first token in response, averaged across all test promts, in milliseconds  
**Avg Speed (t/s)**: How quickly model can generate response tokens, averaged across all test prompts, in tokens per second  
**Avg Memory (MB)**: How much memory the model consumes at its peak (during inference), averaged across all test prompts, in MB  

### Results
*Note: All models are run with llama.cpp backend.*  
| Model | Parameters | Size | Load Time | Avg TTFT | Avg Speed | Avg Memory |
|-------|------------|-----------|---------------|---------------|-----------------|-----------------|
| MobileLLM-125M | 125M | 273.65 MB | 0.76 s | 26 ms | 102.48 t/s | 319 MB |
| TinyLlama-1.1B | 1.1B | 2099.06 MB | 5.68 s | 89 ms | 14.06 t/s | 2144 MB |
| LLaVa-Phi2-3B (Q4_K_M) | 3B | 1657.14 MB | 4.78 s | 128 ms | 14.82 t/s | 3367 MB |
| Phi-4-mini-instruct (Q4_K_M) | 4B | 2376.44 MB | 5.00 s | 164 ms | 10.65 t/s | 3836 MB |
| Qwen2.5-7B-Instruct-1M (Q4_K_M) | 7B | 4466.13 MB | 14.66 s | 385 ms | 6.18 t/s | 7192 MB |
| Gemma-3n-E4B (Q4_K_M) | 8B (Effectively 4B) | 4328.78 MB | 8.34 s | 231 ms | 8.03 t/s | 6483 MB |
| MiniCPM-V4.5 (Q4_K_M) | 9B | 4793.85 MB | 13.86 s | 499 ms | 5.85 t/s | 6780 MB |
| Phi-4 (Q3_K_S) | 15B | 6203.41 MB | 17.28 s | 837 ms | 3.13 t/s | 6638 MB |

## MMLU Benchmark

The MMLU Benchmark is a multiple-choice question test on a variety of subjects, so the only model metric assessed is accuracy (proportion of correctly answered questions out of all 5700 questions). Per-subject accuracy is also assessed but not included in the results below, as there are too many subjects to include in one table (57 total subjects). Additionally, for our intent in measuring a model's general knowledge, per-subject accuracy is not as important as total accuracy.  

### Results
| Model | Parameters | Accuracy |
|-------|------------|-----------|
| Qwen2.5-7B-Instruct-1M (Q4_K_M) | 7B | 70.65% |
| MiniCPM-V4.5 (Q4_K_M) | 9B | 64.04% |
| Phi-4-mini-instruct (Q4_K_M) | 4B | 63.91% |
| Gemma-3n-E4B (Q4_K_M) | 8B (Effectively 4B) | 61.05% |
| LLaVa-Phi2-3B (Q4_K_M) | 3B | 33.47% |
| TinyLlama-1.1B | 1.1B | 21.04% |
| Phi-4 (Q3_K_S) | 15B | 17.54% |
| MobileLLM-125M | 125M | 13.63% |

## Overview

The table below compares models with both key metrics from the resource benchmark and accuracy on the MMLU benchmark to give a bigger-picture view over which models perform the best. Taking both accuracy and resource consumption into account, Phi-4-mini-instruct (Q4_K_M) seems to be the best choice for edge inference on resource-constrained hardware.  

### Results
| Model | Parameters | Avg TTFT | Avg Speed | Avg Memory | Accuracy |
|-------|------------|----------|-----------|------------|----------|
| MobileLLM-125M | 125M | 26 ms | 102.48 t/s | 319 MB | 13.63% |
| TinyLlama-1.1B | 1.1B | 89 ms | 14.06 t/s | 2144 MB | 21.04% |
| LLaVa-Phi2-3B (Q4_K_M) | 3B | 128 ms | 14.82 t/s | 3367 MB | 33.47% |
| Phi-4-mini-instruct (Q4_K_M) | 4B | 164 ms | 10.65 t/s | 3836 MB | 63.91% |
| Qwen2.5-7B-Instruct-1M (Q4_K_M) | 7B | 385 ms | 6.18 t/s | 7192 MB | 70.65% |
| Gemma-3n-E4B (Q4_K_M) | 8B (Effectively 4B) | 231 ms | 8.03 t/s | 6483 MB | 61.05% |
| MiniCPM-V4.5 (Q4_K_M) | 9B | 499 ms | 5.85 t/s | 6780 MB | 64.04% |
| Phi-4 (Q3_K_S) | 15B | 837 ms | 3.13 t/s | 6638 MB | 17.54% |