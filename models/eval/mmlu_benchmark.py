"""
GGUF Model MMLU Benchmark Script with llama-cpp-python
Evaluates models on the Massive Multitask Language Understanding (MMLU) benchmark
"""
import os
from benchmark_utils import MMLUEvaluation, get_model_paths

def main():
    """Run MMLU benchmark on models"""

    # Configuration
    models = get_model_paths()

    # Initialize evaluator
    evaluator = MMLUEvaluation(
        n_ctx=2048,
        n_threads=4,
        n_gpu_layers=0,  # Set to 35 or more for GPU acceleration
    )

    # Download and load MMLU dataset
    print("Loading MMLU dataset...")
    mmlu_data = evaluator.load_mmlu_dataset(
        subjects='all',  # Use 'all' or list specific subjects like ['mathematics', 'physics']
        split='test',    # 'test', 'validation', or 'dev'
        num_samples=100  # Number of questions per subject (None for all)
    )
    print(f"Loaded {sum(len(qs) for qs in mmlu_data.values())} questions from {len(mmlu_data)} subjects\n")

    # Evaluation settings
    max_tokens = 10  # MMLU only needs single letter response
    temperature = 0.0  # Deterministic answers for consistency

    # Run evaluation on all models
    all_results = {}
    for model_path in models:
        if not os.path.exists(model_path):
            print(f"Warning: Model not found: {model_path}")
            continue
        
        results = evaluator.evaluate_model(
            model_path=model_path,
            mmlu_data=mmlu_data,
            max_tokens=max_tokens,
            temperature=temperature
        )
        all_results[model_path] = results
    
    # Display results
    evaluator.print_results(all_results)
    evaluator.compare_models(all_results)
    
    # Save to file
    evaluator.save_results(all_results, "mmlu_results.json")


if __name__ == "__main__":
    main()