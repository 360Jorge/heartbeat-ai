# Cardiac AI — Coupled Van der Pol Oscillators with Neural Coupling Control

A browser-based simulation of two coupled Van der Pol oscillators modeling respiratory sinus arrhythmia (RSA), with a neural network controller trained in PyTorch and deployed via ONNX and Next.js.

## What It Does

The heart and respiratory system are modeled as two coupled nonlinear oscillators:

$$\ddot{x}_1 - \mu_1(1 - x_1^2)\dot{x}_1 + x_1 = \alpha(x_2 - x_1)$$
$$\ddot{x}_2 - \mu_2(1 - x_2^2)\dot{x}_2 + x_2 = \beta(x_1 - x_2)$$

A neural network observes the system state and stress level, then outputs coupling parameters α and β in real time — mimicking the role of the autonomic nervous system.

## Stack

- **Rust/WASM** — RK4 integration of the coupled ODE, running in the browser
- **PyTorch** — controller network trained on synthetic simulation data
- **ONNX + onnxruntime-node** — model export and server-side inference
- **Next.js** — frontend simulation + API route for inference
- **Vercel** — deployment

## Project Structure

```
heartbeat-ai/
├── app/
│   ├── api/controller/route.js   # ONNX inference endpoint
│   ├── page.js                   # Simulation + visualization
│   └── globals.css
├── public/
│   └── wasm/
│       ├── vdp_wasm.js           # WASM JS bindings
│       └── vdp_wasm_bg.wasm      # Compiled Rust solver
├── coupling_controller.onnx      # Trained controller model
└── next.config.mjs
```

## Running Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Training the Controller

The training notebook is in Google Colab. It generates synthetic data by simulating the coupled system across stress levels, trains a small feedforward network, and exports to ONNX.

To retrain:
1. Run `training/coupled_vdp_controller.ipynb` in Colab
2. Download `coupling_controller.onnx`
3. Replace the existing file in the project root

## How the Controller Works

The network maps `(x1, y1, x2, y2, stress) → (α, β)`. It is called every 30 animation frames (~500ms). Between calls, the WASM solver advances the ODE using the last known coupling values.

Inference runs server-side via a Next.js API route using `onnxruntime-node`. Input features are standardized using scaler parameters saved from training.

## What to Observe

- At **low stress**, the two limit cycles in the phase portrait run slightly offset — weak coupling, independent rhythms
- At **high stress**, the AI increases α and β, the orbits converge, and the waveforms accelerate
- This models what happens physiologically when the sympathetic nervous system activates

## Next Steps

- Reinforcement learning controller (reward coherence, penalize divergence)
- Heart rate variability (HRV) metrics
- Stochastic perturbations for biological realism
- Neural ODE formulation

## References

- Van der Pol, B. (1926). On relaxation-oscillations. *Philosophical Magazine*
- Eckberg, D.L. (1983). Human sinus arrhythmia as an index of vagal cardiac outflow. *Journal of Applied Physiology*
