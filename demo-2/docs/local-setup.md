# Run Demo 2 on your own device

The website and report review interface run on Windows and Apple silicon Macs. Browser inference uses WebGPU in current Chrome or Edge. Apple silicon compatibility is supported by the runtimes; this project's measured trials use an RTX 5080, not a Mac. Intel Macs are outside this demo's target.

## Browser option — no companion needed

Open the [project demo](https://anthonyfald.github.io/capstone-grp2/demo-2/), choose a report set, and choose a browser model. Qwen 3 4B is the lower-memory option; Qwen 3.5 9B is the browser quality option. Initial weights/library downloads need internet and several GB of storage. Available GPU/unified memory and browser allocation limits determine whether a model fits. Other GPU workloads compete for the same memory. If the larger browser model fails to load, close other GPU-heavy work and use 4B.

For a local website, install Node.js 22 or newer, clone this repository, run `node scripts/serve.mjs`, and open the printed URL. No package install is needed for the site or companion bridge. Browser models still fetch the pinned WebLLM runtime and weights; this path is not a fully offline bundle.

## Detailed local option — Qwen 3.5 9B reasoning

The detailed local profile reviews four subjects separately, each using the complete chronology and an original-source verification pass. It uses Qwen 3.5 9B with reasoning and roughly 6.6 GB of model files plus working memory. The browser's 4B option remains available for lower-memory machines. Ollama on Apple silicon requires macOS 14 or newer; this session tests Windows only.

## Optional higher-capacity comparison — Qwen 3.5 27B

This experimental one-pass reasoning option uses about 17 GB of model files plus working memory. A 16 GB RTX 5080 cannot hold the entire workload in VRAM; Ollama offloads part to system RAM. Our test PC has about 95 GiB of system RAM. The pilot took about eleven minutes and missed important concerns, so larger capacity is not presented as better accuracy. On Apple silicon, 32 GB or more unified memory is a practical starting point; memory pressure and speed must be tested on the actual Mac. No Mac performance result is claimed.

Install [Ollama](https://ollama.com/download) and Node.js. A dedicated local Ollama instance uses port 11435 so the demo does not reconfigure your usual server. In a terminal:

Windows PowerShell:

```powershell
$env:OLLAMA_HOST='127.0.0.1:11435'
$env:OLLAMA_NO_CLOUD='1'
$env:OLLAMA_NUM_PARALLEL='1'
ollama serve
```

Apple silicon, Terminal:

```sh
OLLAMA_HOST=127.0.0.1:11435 OLLAMA_NO_CLOUD=1 OLLAMA_NUM_PARALLEL=1 ollama serve
```

In a second terminal, install the model once:

```powershell
# Windows PowerShell
$env:OLLAMA_HOST='127.0.0.1:11435'
ollama pull qwen3.5:9b
# Optional larger comparison:
ollama pull qwen3.5:27b
```

```sh
# macOS
OLLAMA_HOST=127.0.0.1:11435 ollama pull qwen3.5:9b
# Optional larger comparison:
OLLAMA_HOST=127.0.0.1:11435 ollama pull qwen3.5:27b
```

From this repository, run `node scripts/serve-local-ai.mjs`. Open **http://127.0.0.1:4177/demo-2/**. The installed 9B detailed local profile is selected when the companion connects. Keep the two servers running while using it. Model download is a one-time internet transfer; subsequent local-page inference needs no hosted AI service. On the public website, browser local-network permissions may prevent connection; use the local companion page if that occurs. Switching to a browser model releases the companion's loaded model first to avoid competing for GPU memory.

The bridge binds only to loopback, restricts allowed origins and Host headers, requires a per-launch token, validates input size, and serializes inference. It does not write uploaded reports to disk. Export runs explicitly to keep them. Tokens are not included in run exports. Stop the servers to release resources. Model files remain available for reuse.

The current Windows workspace also includes `Open Demo 2.cmd` one directory above the repository, using its verified portable runtime. That convenience launcher is machine-specific; the instructions above are the portable setup.

Sources: [Ollama Windows](https://docs.ollama.com/windows), [Ollama macOS](https://docs.ollama.com/macos), [Qwen 3.5 model sizes](https://ollama.com/library/qwen3.5), [WebLLM supported models](https://github.com/mlc-ai/web-llm/blob/v0.2.85/src/config.ts).

The downloadable Meeting Demo desktop package also includes the Demo 2 browser interface and public data. Its separate native reasoning option still needs the Ollama/Node companion above. Use the 4177 page for that connection.
