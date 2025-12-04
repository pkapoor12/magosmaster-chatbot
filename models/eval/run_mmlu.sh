#!/bin/bash
#SBATCH -N 1                      # allocate 1 compute node
#SBATCH -n 1                      # total number of tasks
#SBATCH --mem=16g                 # allocate 16 GB of memory
#SBATCH -J "MMLU benchmarking"    # name of the job
#SBATCH -o mmlu_results_%j.out    # name of the output file
#SBATCH -e mmlu_results_%j.err    # name of the error file
#SBATCH -p short                  # partition to submit to
#SBATCH -t 12:00:00               # time limit of 12 hours
#SBATCH --gres=gpu:1              # request 1 GPU

module load python                # load python
module load cuda                  # load cuda
module load cmake                 # load cmake

python3 -m venv benchmark_env     # set up virtual environment for benchmarking
source benchmark_env/bin/activate

# install llama-cpp-python with CUDA support - bypass linker errors 
export CUDA_HOME=/cm/shared/spack/opt/spack/linux-ubuntu20.04-x86_64/gcc-13.2.0/cuda-12.9.0-a7ap4jlxbys2l3u6lar2h6wlp53nhntd
export LD_LIBRARY_PATH=$CUDA_HOME/lib64:$LD_LIBRARY_PATH
export LIBRARY_PATH=$CUDA_HOME/lib64:$LIBRARY_PATH

CMAKE_ARGS="-DGGML_CUDA=on" \
LDFLAGS="-L$CUDA_HOME/lib64 -Wl,-rpath,$CUDA_HOME/lib64" \
MAX_JOBS=2 \
pip install llama-cpp-python --no-cache-dir --verbose

# install remaining dependencies
pip install -r requirements.hpc.txt

# run benchmarking script
python3 mmlu_benchmark.py