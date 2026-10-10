import type { ProjectVideo } from '@/lib/types';

export function ProjectVideos({ videos }: { videos: ProjectVideo[] }) {
  const visibleVideos = videos.filter(video => Boolean(video.url)).sort((a, b) => a.sort_order - b.sort_order);
  if (!visibleVideos.length) return null;

  return <section className="project-videos" aria-labelledby="project-videos-heading">
    <h2 id="project-videos-heading">Our work <em>in motion.</em></h2>
    <div className="project-video-grid">{visibleVideos.map((video, index) => <figure key={video.id}>
      <video src={video.url} controls playsInline preload="metadata" aria-label={video.caption || `Project video ${index + 1}`}>Your browser does not support embedded videos.</video>
      {video.caption && <figcaption>{video.caption}</figcaption>}
    </figure>)}</div>
  </section>;
}
