from llama_cpp import Llama
import time
import psutil
import os
import json
from typing import Dict, List
from dataclasses import dataclass, asdict
import statistics

@dataclass
class BenchmarkResult:
    model_name: str
    model_size_mb: float
    prompt_tokens: int
    generated_tokens: int
    ttft_ms: float
    total_time_s: float
    tokens_per_second: float
    memory_used_mb: float
    peak_memory_mb: float
    prompt: str
    response: str

class ModelBenchmark:
    def __init__(self, n_ctx: int = 2048, n_threads: int = 4, n_gpu_layers: int = 0):
        """
        Initialize benchmark configuration
        
        Args:
            n_ctx: Context window size
            n_threads: Number of CPU threads
            n_gpu_layers: Number of layers to offload to GPU (0 for CPU-only)
        """
        self.n_ctx = n_ctx
        self.n_threads = n_threads
        self.n_gpu_layers = n_gpu_layers
        self.process = psutil.Process(os.getpid())
    
    def get_memory_usage(self) -> float:
        """Get current memory usage in MB"""
        return self.process.memory_info().rss / 1024 / 1024
    
    def get_model_size(self, model_path: str) -> float:
        """Get model file size in MB"""
        return os.path.getsize(model_path) / 1024 / 1024
    
    @staticmethod
    def get_model_paths() -> List[str]:
        """Read relative model paths"""
        with open('models.txt', 'r') as model_paths:
            models = model_paths.read().splitlines()
            return models
    
    def benchmark_model(
        self, 
        model_path: str, 
        prompts: List[str],
        max_tokens: int = 128,
        temperature: float = 0.7,
        repetitions: int = 3
    ) -> List[BenchmarkResult]:
        """
        Benchmark a single model with multiple prompts
        
        Args:
            model_path: Path to GGUF model file
            prompts: List of prompts to test
            max_tokens: Maximum tokens to generate
            temperature: Sampling temperature
            repetitions: Number of times to run each prompt for averaging
        
        Returns:
            List of BenchmarkResult objects
        """
        print(f"\n{'='*80}")
        print(f"Loading model: {os.path.basename(model_path)}")
        print(f"{'='*80}")
        
        model_size = self.get_model_size(model_path)
        baseline_memory = self.get_memory_usage()
        
        # Load model
        load_start = time.time()
        llm = Llama(
            model_path=model_path,
            n_ctx=self.n_ctx,
            n_threads=self.n_threads,
            n_gpu_layers=self.n_gpu_layers,
            verbose=False
        )
        load_time = time.time() - load_start
        print(f"Model loaded in {load_time:.2f}s")
        
        memory_after_load = self.get_memory_usage()
        model_memory = memory_after_load - baseline_memory
        print(f"Model memory usage: {model_memory:.2f} MB")
        
        results = []
        
        for prompt_idx, prompt in enumerate(prompts):
            print(f"\nPrompt {prompt_idx + 1}/{len(prompts)}: {prompt[:50]}...")
            
            prompt_results = []
            
            for rep in range(repetitions):
                print(f"  Repetition {rep + 1}/{repetitions}...", end=" ")
                
                start_time = time.time()
                first_token_time = None
                generated_text = ""
                token_count = 0
                memory_before = self.get_memory_usage()
                peak_memory = memory_before
                
                # Stream tokens and measure TTFT
                for output in llm(
                    prompt,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    stream=True,
                    echo=False
                ):
                    if first_token_time is None:
                        first_token_time = time.time() - start_time
                    
                    token_count += 1
                    generated_text += output['choices'][0]['text']
                    
                    # Track peak memory
                    current_memory = self.get_memory_usage()
                    peak_memory = max(peak_memory, current_memory)
                
                total_time = time.time() - start_time
                memory_used = self.get_memory_usage() - memory_before
                
                # Get prompt token count (approximate)
                prompt_tokens = len(llm.tokenize(prompt.encode('utf-8')))
                
                result = BenchmarkResult(
                    model_name=os.path.basename(model_path),
                    model_size_mb=model_size,
                    prompt_tokens=prompt_tokens,
                    generated_tokens=token_count,
                    ttft_ms=first_token_time * 1000 if first_token_time else 0,
                    total_time_s=total_time,
                    tokens_per_second=token_count / total_time if total_time > 0 else 0,
                    memory_used_mb=memory_used,
                    peak_memory_mb=peak_memory - baseline_memory,
                    prompt=prompt,
                    response=generated_text.strip()
                )
                
                prompt_results.append(result)
                print(f"TTFT: {result.ttft_ms:.0f}ms, Speed: {result.tokens_per_second:.2f} t/s")
            
            # Average results for this prompt
            avg_result = BenchmarkResult(
                model_name=prompt_results[0].model_name,
                model_size_mb=prompt_results[0].model_size_mb,
                prompt_tokens=prompt_results[0].prompt_tokens,
                generated_tokens=int(statistics.mean(r.generated_tokens for r in prompt_results)),
                ttft_ms=statistics.mean(r.ttft_ms for r in prompt_results),
                total_time_s=statistics.mean(r.total_time_s for r in prompt_results),
                tokens_per_second=statistics.mean(r.tokens_per_second for r in prompt_results),
                memory_used_mb=statistics.mean(r.memory_used_mb for r in prompt_results),
                peak_memory_mb=statistics.mean(r.peak_memory_mb for r in prompt_results),
                prompt=prompt_results[0].prompt,
                response=prompt_results[0].response  # Use first response as example
            )
            
            results.append(avg_result)
        
        # Cleanup
        del llm
        
        return results
    
    def print_results(self, all_results: Dict[str, List[BenchmarkResult]]):
        """Print formatted benchmark results"""
        print(f"\n{'='*80}")
        print("BENCHMARK RESULTS SUMMARY")
        print(f"{'='*80}\n")
        
        for model_path, results in all_results.items():
            print(f"\nModel: {os.path.basename(model_path)}")
            print(f"Size: {results[0].model_size_mb:.2f} MB")
            print(f"-" * 80)
            print(f"{'Prompt':<40} {'TTFT (ms)':<12} {'Speed (t/s)':<12} {'Memory (MB)':<12}")
            print(f"-" * 80)
            
            for result in results:
                prompt_preview = result.prompt[:37] + "..." if len(result.prompt) > 40 else result.prompt
                print(f"{prompt_preview:<40} {result.ttft_ms:<12.0f} {result.tokens_per_second:<12.2f} {result.peak_memory_mb:<12.0f}")
            
            # Calculate averages
            avg_ttft = statistics.mean(r.ttft_ms for r in results)
            avg_speed = statistics.mean(r.tokens_per_second for r in results)
            avg_memory = statistics.mean(r.peak_memory_mb for r in results)
            
            print(f"-" * 80)
            print(f"{'AVERAGE':<40} {avg_ttft:<12.0f} {avg_speed:<12.2f} {avg_memory:<12.0f}")
            print()
    
    def save_results(self, all_results: Dict[str, List[BenchmarkResult]], output_file: str):
        """Save results to JSON file"""
        json_results = {
            model: [asdict(r) for r in results]
            for model, results in all_results.items()
        }
        
        with open(output_file, 'w') as f:
            json.dump(json_results, f, indent=2)
        
        print(f"\nResults saved to: {output_file}")
    
    def compare_models(self, all_results: Dict[str, List[BenchmarkResult]]):
        """Print side-by-side comparison of models"""
        print(f"\n{'='*80}")
        print("MODEL COMPARISON")
        print(f"{'='*80}\n")
        
        print(f"{'Model':<30} {'Avg TTFT (ms)':<15} {'Avg Speed (t/s)':<15} {'Avg Memory (MB)':<15}")
        print(f"-" * 75)
        
        for model_path, results in all_results.items():
            model_name = os.path.basename(model_path)[:28]
            avg_ttft = statistics.mean(r.ttft_ms for r in results)
            avg_speed = statistics.mean(r.tokens_per_second for r in results)
            avg_memory = statistics.mean(r.peak_memory_mb for r in results)
            
            print(f"{model_name:<30} {avg_ttft:<15.0f} {avg_speed:<15.2f} {avg_memory:<15.0f}")