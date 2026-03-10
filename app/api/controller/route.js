import * as ort from 'onnxruntime-node';
import path from 'path';

// Scaler parameters from training
const MEAN  = [0.42705773003349545, -0.02785356216022533, 0.2763273670815389, -0.257906840741695, 0.49999999999999994];
const SCALE = [1.5404885159821033,   1.5712256600666719,  1.3129388280146943,  1.3378783590515275, 0.3415650255319866];

let session = null;

async function getSession() {
    if (!session) {
        const modelPath = path.join(process.cwd(), 'coupling_controller.onnx');
        session = await ort.InferenceSession.create(modelPath);
    }
    return session;
}

function scaleInput(x1, y1, x2, y2, stress) {
    const raw = [x1, y1, x2, y2, stress];
    return raw.map((v, i) => (v - MEAN[i]) / SCALE[i]);
}

export async function POST(request) {
    try {
        const { x1, y1, x2, y2, stress } = await request.json();

        const scaled = scaleInput(x1, y1, x2, y2, stress);
        const tensor = new ort.Tensor('float32', Float32Array.from(scaled), [1, 5]);

        const sess = await getSession();
        const results = await sess.run({ state: tensor });
        const [alpha, beta] = results.coupling.data;

        return Response.json({ alpha, beta });

    } catch (err) {
        console.error(err);
        return Response.json({ error: err.message }, { status: 500 });
    }
}