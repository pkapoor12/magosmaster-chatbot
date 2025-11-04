"""
GGUF Model Benchmarking Script with llama-cpp-python
Measures TTFT, generation speed, memory usage, and more
"""
import os
from benchmark_utils import ModelBenchmark, get_model_paths

def main():
    """Run resource benchmark on models"""
    
    # Configuration
    models = get_model_paths()
    
    prompts = [
        "Write a short poem about AI.",
        "Explain quantum computing in simple terms.",
        "What are the benefits of exercise?",
    ]
    
    # Initialize benchmarker
    benchmark = ModelBenchmark(
        n_ctx=2048,
        n_threads=4,
        n_gpu_layers=0  # Set to 35 or more for GPU acceleration
    )
    
    # Run benchmarks
    all_results = {}
    for model_path in models:
        if not os.path.exists(model_path):
            print(f"Warning: Model not found: {model_path}")
            continue
        
        results = benchmark.benchmark_model(
            model_path=model_path,
            prompts=prompts,
            max_tokens=128,
            temperature=0.7,
            repetitions=3
        )
        all_results[model_path] = results
    
    # Display results
    benchmark.print_results(all_results)
    benchmark.compare_models(all_results)
    
    # Save to file
    benchmark.save_results(all_results, "benchmark_results.json")


if __name__ == "__main__":
    main()