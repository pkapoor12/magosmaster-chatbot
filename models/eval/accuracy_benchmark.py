"""
GGUF Model Accuracy Evaluation Script with llama-cpp-python
Measures semantic accuracy using sentence transformers
"""
import os
from benchmark_utils import ModelEvaluation, get_model_paths, load_qa_dataset

def main():
    """Run accuracy benchmark on models"""

    # Configuration
    models = get_model_paths()

    # Initialize evaluator
    evaluator = ModelEvaluation(
        n_ctx=2048,
        n_threads=4,
        n_gpu_layers=0,  # Set to 35 or more for GPU acceleration
        similarity_model="all-MiniLM-L6-v2"  # Fast and efficient
    )

    # Load Q&A dataset
    print(f"Loading Q&A dataset from: evaluation_set.json")
    qa_dataset = load_qa_dataset()
    print(f"Loaded {len(qa_dataset)} Q&A pairs\n")

    # Evaluation settings
    similarity_threshold = 0.7  # Answers with similarity >= 0.7 are correct
    max_tokens = 256  # Maximum tokens per answer
    temperature = 0.1  # Low temperature for deterministic answers

    # Run evaluation on all models
    all_results = {}
    for model_path in models:
        if not os.path.exists(model_path):
            print(f"Warning: Model not found: {model_path}")
            continue
        
        results = evaluator.evaluate_model(
            model_path=model_path,
            qa_dataset=qa_dataset,
            similarity_threshold=similarity_threshold,
            max_tokens=max_tokens,
            temperature=temperature
        )
        all_results[model_path] = results
    
    # Display results
    evaluator.print_results(all_results, similarity_threshold)
    evaluator.compare_models(all_results)
    
    # Save to file
    evaluator.save_results(all_results, "accuracy_results.json", similarity_threshold)


if __name__ == "__main__":
    main()