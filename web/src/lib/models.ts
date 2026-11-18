// Per-model display constants shared by the console and results pages.
// Series colors were validated for CVD separation on the dark panel surface.
export const MODEL_COLOR: Record<string, string> = {
  cnn_lstm: 'var(--color-series-a)',
  frame_mean: 'var(--color-series-b)',
}

export const MODEL_NAME: Record<string, string> = {
  cnn_lstm: 'CNN-LSTM',
  frame_mean: 'Mean-pool',
}
