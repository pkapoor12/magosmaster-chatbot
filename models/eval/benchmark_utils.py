from llama_cpp import Llama
import time
import psutil
import os
import json
from typing import Dict, List
from dataclasses import dataclass, asdict
from sentence_transformers import SentenceTransformer, util
import statistics

def get_model_paths() -> List[str]:
    """Read relative model paths"""
    with open('models.txt', 'r') as model_paths:
        models = model_paths.read().splitlines()
        return models
    
def load_qa_dataset() -> List[Dict[str, str]]:
        """
        Load Q&A dataset from JSON file.
        
        Expected format:
        [
            {"question": "What is...?", "answer": "..."},
            {"question": "Who was...?", "answer": "..."},
            ...
        ]
        
        Args:
            json_path: Path to JSON file
        
        Returns:
            List of question-answer dictionaries
        """
        with open('evaluation_set.json', 'r', encoding='utf-8') as f:
            data = json.load(f)
        return data

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

@dataclass
class EvaluationResult:
    model_name: str
    question: str
    expected_answer: str
    predicted_answer: str
    similarity_score: float
    correct: bool

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

class ModelEvaluation:
    def __init__(self, n_ctx: int = 2048, n_threads: int = 4, n_gpu_layers: int = 0, similarity_model: str = "all-MiniLM-L6-v2"):
        """
        Initialize evaluation configuration
        
        Args:
            n_ctx: Context window size
            n_threads: Number of CPU threads
            n_gpu_layers: Number of layers to offload to GPU (0 for CPU-only)
            similarity_model: Sentence transformer model for semantic similarity
        """
        self.n_ctx = n_ctx
        self.n_threads = n_threads
        self.n_gpu_layers = n_gpu_layers

        # Load sentence transformer for semantic similarity
        print(f"Loading sentence transformer: {similarity_model}")
        self.similarity_model = SentenceTransformer(similarity_model)
    
    def generate_answer(self, llm: Llama, question: str, max_tokens: int = 256, temperature: float = 0.1) -> str:
        """
        Generate an answer for a given question.
        
        Args:
            question: The question to answer
            max_tokens: Maximum tokens to generate
            temperature: Sampling temperature (lower = more deterministic)
        
        Returns:
            Generated answer string
        """
        prompt = f"""Answer the following question concisely and accurately.
                    Question: {question}
                    Answer:"""
        
        output = llm(
            prompt, 
            max_tokens=max_tokens, 
            temperature=temperature, 
            stop=["Question:", "\n\n"],
            echo=False)
        
        answer = output['choices'][0]['text'].strip()
        return answer
        
    def compute_semantic_similarity(self, text1: str, text2: str) -> float:
        """
        Compute semantic similarity between two texts using sentence transformers.
        
        Args:
            text1: First text (predicted answer)
            text2: Second text (expected answer)
        
        Returns:
            Cosine similarity score (0 to 1)
        """
        # Encode both texts
        embedding1 = self.similarity_model.encode(text1, convert_to_tensor=True)
        embedding2 = self.similarity_model.encode(text2, convert_to_tensor=True)
        
        # Compute cosine similarity
        similarity = util.cos_sim(embedding1, embedding2).item()
        return similarity
    
    def evaluate_model(self, model_path: str, qa_dataset: List[Dict[str, str]], similarity_threshold: float = 0.7,
                       max_tokens: int = 256, temperature: float = 0.1) -> List[EvaluationResult]:
        """
        Evaluate a single model on the Q&A dataset using semantic similarity.
        
        Args:
            model_path: Path to GGUF model
            qa_dataset: List of Q&A pairs
            similarity_threshold: Minimum similarity score to consider correct (0-1)
        
        Returns:
            Dictionary with evaluation results
        """
        # Load model
        print(f"\n{'='*80}")
        print(f"Loading model: {os.path.basename(model_path)}")
        print(f"{'='*80}")

        llm = Llama(
                model_path=model_path,
                n_ctx=self.n_ctx,
                n_threads=self.n_threads,
                n_gpu_layers=self.n_gpu_layers,
                verbose=False
            )
        
        model_name = os.path.basename(model_path)
        correct = 0
        total = len(qa_dataset)
        results = []
        similarity_scores = []

        print(f"Evaluating on {total} questions...")
        print(f"Similarity threshold: {similarity_threshold}")
        print("-" * 80)

        for i, qa_pair in enumerate(qa_dataset, 1):
            question = qa_pair['question']
            expected_answer = qa_pair['answer']
            
            # Generate prediction
            predicted_answer = self.generate_answer(llm, question, max_tokens, temperature)
            
            # Compute semantic similarity
            similarity = self.compute_semantic_similarity(predicted_answer, expected_answer)
            similarity_scores.append(similarity)
            
            # Check if correct based on threshold
            is_correct = similarity >= similarity_threshold
            
            if is_correct:
                correct += 1
            
            # Store result
            result = EvaluationResult(
                model_name=model_name,
                question=question,
                expected_answer=expected_answer,
                predicted_answer=predicted_answer,
                similarity_score=float(similarity),
                correct=is_correct
            )
            results.append(result)

            # Progress update
            if i % 10 == 0 or i == total:
                current_acc = (correct / i) * 100
                avg_sim = statistics.mean(similarity_scores)
                print(f"Progress: {i}/{total} | Accuracy: {current_acc:.2f}% | Avg Similarity: {avg_sim:.3f}")

        # Cleanup
        del llm

        return results
    
    def print_results(self, all_results: Dict[str, List[EvaluationResult]], 
                     similarity_threshold: float):
        """Print formatted evaluation results"""
        print(f"\n{'='*80}")
        print("EVALUATION RESULTS SUMMARY")
        print(f"{'='*80}\n")
        
        for model_path, results in all_results.items():
            model_name = os.path.basename(model_path)
            correct = sum(1 for r in results if r.correct)
            total = len(results)
            accuracy = (correct / total * 100) if total > 0 else 0
            mean_sim = statistics.mean(r.similarity_score for r in results)
            median_sim = statistics.median(r.similarity_score for r in results)
            
            print(f"\nModel: {model_name}")
            print(f"Threshold: {similarity_threshold}")
            print(f"-" * 80)
            print(f"Accuracy: {accuracy:.2f}% ({correct}/{total})")
            print(f"Mean Similarity: {mean_sim:.3f}")
            print(f"Median Similarity: {median_sim:.3f}")
            print(f"-" * 80)
            
            # Show some example results
            print("\nSample Results:")
            for i, result in enumerate(results[:3], 1):
                status = "✓" if result.correct else "✗"
                print(f"\n{i}. {status} (Similarity: {result.similarity_score:.3f})")
                print(f"   Q: {result.question[:70]}...")
                print(f"   Expected: {result.expected_answer[:60]}...")
                print(f"   Predicted: {result.predicted_answer[:60]}...")
    
    def save_results(self, all_results: Dict[str, List[EvaluationResult]], 
                    output_file: str, similarity_threshold: float):
        """Save results to JSON file"""
        json_results = {}
        
        for model_path, results in all_results.items():
            model_name = os.path.basename(model_path)
            correct = sum(1 for r in results if r.correct)
            total = len(results)
            
            json_results[model_name] = {
                'accuracy': (correct / total * 100) if total > 0 else 0,
                'correct': correct,
                'total': total,
                'mean_similarity': statistics.mean(r.similarity_score for r in results),
                'median_similarity': statistics.median(r.similarity_score for r in results),
                'similarity_threshold': similarity_threshold,
                'results': [asdict(r) for r in results]
            }
        
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(json_results, f, indent=2)
        
        print(f"\nResults saved to: {output_file}")
    
    def compare_models(self, all_results: Dict[str, List[EvaluationResult]]):
        """Print side-by-side comparison of models"""
        print(f"\n{'='*80}")
        print("MODEL COMPARISON")
        print(f"{'='*80}\n")
        
        print(f"{'Model':<40} {'Accuracy':<12} {'Mean Sim':<12}")
        print(f"-" * 80)
        
        # Sort by accuracy
        sorted_results = sorted(
            all_results.items(),
            key=lambda x: sum(1 for r in x[1] if r.correct) / len(x[1]),
            reverse=True
        )
        
        for model_path, results in sorted_results:
            model_name = os.path.basename(model_path)[:38]
            correct = sum(1 for r in results if r.correct)
            total = len(results)
            accuracy = (correct / total * 100) if total > 0 else 0
            mean_sim = statistics.mean(r.similarity_score for r in results)
            
            print(f"{model_name:<40} {accuracy:>6.2f}%     {mean_sim:>6.3f}")