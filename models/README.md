# Models

Store GGUF model files in this directory for benchmarking.  
As an example, use a [4-bit quantized Phi-4-mini-instruct][p].  

[p]: https://huggingface.co/pujeetk/phi-4-mini-instruct-Q4_K_M "phi-4-mini-instruct-Q4_K_M"

## Benchmarking Instructions
From this directory, navigate to eval directory and install dependencies (make sure you have a virtual environment set up and activated beforehand).
```bash
cd eval  
pip install -r requirements.txt  
```
Create a 'models.txt' containing relative paths (from eval directory) to each model you want to benchmark on each line. For example:  
```text
../phi-4-mini-instruct-Q4_K_M.gguf  
```
Run the resource benchmark.  
```bash
python resource_benchmark.py  
```
At the end, results will be saved to 'benchmark_results.json'.  