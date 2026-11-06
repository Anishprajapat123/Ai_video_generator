import type { Metadata } from 'next';
import { Studio } from '../components/studio';
import './globals.css';
import './script-review.css';
import './storyboard-review.css';
import './scene-media.css';
import './project-actions.css';
import './create-video.css';

export const metadata: Metadata = { title: 'AI Video Studio', description: 'Turn your ideas into videos, one scene at a time.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><Studio>{children}</Studio></body></html>;
}
