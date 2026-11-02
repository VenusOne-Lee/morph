// axe-core probes canvas for icon ligatures; jsdom has no canvas.
HTMLCanvasElement.prototype.getContext = (() => null) as never;
import { configure } from '@testing-library/react';

// Shared CI machines run every package's tests at once; give async queries room.
configure({ asyncUtilTimeout: 5000 });
