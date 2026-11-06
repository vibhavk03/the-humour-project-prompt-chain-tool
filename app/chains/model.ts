export type Step = { id: string; name: string; prompt: string; outputType: 'text' | 'image' };
export type Chain = { id: string; name: string; description: string; steps: Step[]; updatedAt: string; revision?: number };
export type Media = { type: 'text' | 'image'; content: string; storagePath?: string };
export type StepResult = { step: Step; status: 'pending' | 'running' | 'completed' | 'failed'; output?: Media; error?: string; model?: string };
export type Run = { id: string; chainId: string; chainName: string; createdAt: string; input: Media; results: StepResult[]; status: 'running' | 'completed' | 'failed' | 'interrupted'; updatedAt?: string };
export const uid = () => crypto.randomUUID();
export const newStep = (): Step => ({ id: uid(), name: 'Untitled step', prompt: '', outputType: 'text' });
export function makeChain(template = 'blank'): Chain {
  const templates: Record<string, { name: string; description: string; steps: Omit<Step, 'id'>[] }> = {
    captions: { name: 'Find the funny', description: 'A fresh perspective. A funny observation. Five captions worth sharing.', steps: [
      { name: 'Describe the scene', prompt: 'Describe the supplied image or idea in concrete detail. Highlight the subjects, setting, and any unexpected details.', outputType: 'text' },
      { name: 'Find the funny angle', prompt: 'Find a funny, surprising observation about this description. Be playful and specific. Return your strongest observation in two sentences.', outputType: 'text' },
      { name: 'Write five captions', prompt: 'Turn this observation into five distinct, short, funny captions. Number them 1–5. Keep each under 20 words.', outputType: 'text' },
    ] },
    poster: { name: 'Idea to illustration', description: 'Turn a little idea into a vivid visual world.', steps: [
      { name: 'Develop the art direction', prompt: 'Turn the supplied idea or image into an imaginative illustration brief. Describe composition, colors, lighting, and mood. Keep it under 150 words.', outputType: 'text' },
      { name: 'Make the illustration', prompt: 'Create a polished editorial illustration following this art direction. Use bold shapes, warm colors, and a distinctive composition.', outputType: 'image' },
    ] },
    blank: { name: 'Untitled chain', description: '', steps: [] },
  };
  const t = templates[template] ?? templates.blank;
  return { id: uid(), name: t.name, description: t.description, steps: t.steps.map(s => ({ ...s, id: uid() })), updatedAt: new Date().toISOString() };
}
