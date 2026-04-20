/* Minimal icon set — stroke-based, 15px target */
const Icon = ({ d, size = 15, fill = "none", stroke = "currentColor", sw = 1.6, children }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
    {d ? <path d={d} /> : children}
  </svg>
);

const I = {
  home:     () => <Icon><path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1v-8.5Z"/></Icon>,
  chat:     () => <Icon><path d="M21 12a8 8 0 0 1-11.3 7.3L4 21l1.7-5.7A8 8 0 1 1 21 12Z"/></Icon>,
  agents:   () => <Icon><circle cx="12" cy="8" r="3.2"/><path d="M5 20a7 7 0 0 1 14 0"/><circle cx="12" cy="8" r="1" fill="currentColor"/></Icon>,
  sessions: () => <Icon><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h6"/></Icon>,
  yt:       () => <Icon><rect x="2.5" y="6" width="19" height="12" rx="3"/><path d="m10 9.5 5 2.5-5 2.5v-5Z" fill="currentColor" stroke="none"/></Icon>,
  cron:     () => <Icon><circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 2"/></Icon>,
  review:   () => <Icon><path d="M4 6h16M4 12h10M4 18h8"/><circle cx="19" cy="17" r="3"/><path d="m21 19-1.3-1.3"/></Icon>,
  channels: () => <Icon><path d="M12 2v20M2 12h20M5 5l14 14M19 5 5 19"/></Icon>,
  tools:    () => <Icon><path d="M14.7 6.3a4 4 0 1 0 3 3L21 6l-2-2-3.3 2.3Z"/><path d="M12 10 4 18l2 2 8-8"/></Icon>,
  config:   () => <Icon><path d="m12 2 2 3.4L18 4l-.3 4 3.3 2-3.3 2 .3 4-4-1.4L12 18l-2-3.4L6 16l.3-4L3 10l3.3-2L6 4l4 1.4L12 2Z"/></Icon>,
  settings: () => <Icon><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h.1a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></Icon>,
  relay:    () => <Icon><path d="M4 17h12a3 3 0 0 0 0-6h-2"/><path d="M8 13h12"/><path d="m11 10-3 3 3 3"/></Icon>,
  rules:    () => <Icon><path d="M4 6h8M4 12h16M4 18h12"/><circle cx="15" cy="6" r="1.5" fill="currentColor" stroke="none"/><circle cx="8" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="19" cy="18" r="1.5" fill="currentColor" stroke="none"/></Icon>,
  brain:    () => <Icon><path d="M9 5a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 1 4 3 3 0 0 0 3 3 3 3 0 0 0 4 0 3 3 0 0 0 4 0 3 3 0 0 0 3-3 3 3 0 0 0 1-4 3 3 0 0 0-2-5 3 3 0 0 0-3-3 3 3 0 0 0-3-1 3 3 0 0 0-3 1Z"/></Icon>,
  caps:     () => <Icon><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></Icon>,
  cmd:      () => <Icon><path d="M9 6H6a2 2 0 0 0 0 4h12a2 2 0 0 0 0-4h-3m-6 0v12m6-12v12M6 14a2 2 0 0 0 0 4h12a2 2 0 0 0 0-4"/></Icon>,
  search:   () => <Icon><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></Icon>,
  plus:     () => <Icon><path d="M12 5v14M5 12h14"/></Icon>,
  dots:     () => <Icon><circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.2" fill="currentColor" stroke="none"/></Icon>,
  bell:     () => <Icon><path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8Z"/><path d="M10 21a2 2 0 0 0 4 0"/></Icon>,
  play:     () => <Icon><path d="M6 4v16l14-8L6 4Z" fill="currentColor" stroke="none"/></Icon>,
  pause:    () => <Icon><path d="M7 4h4v16H7zM13 4h4v16h-4z" fill="currentColor" stroke="none"/></Icon>,
  stop:     () => <Icon><rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" stroke="none"/></Icon>,
  check:    () => <Icon><path d="m4 12 5 5 11-11"/></Icon>,
  x:        () => <Icon><path d="m6 6 12 12M18 6 6 18"/></Icon>,
  right:    () => <Icon><path d="m9 6 6 6-6 6"/></Icon>,
  bolt:     () => <Icon><path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z"/></Icon>,
  filter:   () => <Icon><path d="M3 5h18l-7 9v6l-4-2v-4L3 5Z"/></Icon>,
  refresh:  () => <Icon><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></Icon>,
  copy:     () => <Icon><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></Icon>,
  sliders:  () => <Icon><path d="M4 6h8m4 0h4M4 12h4m4 0h8M4 18h12m4 0h0"/><circle cx="14" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></Icon>,
  attach:   () => <Icon><path d="M21 11.5 12.5 20a5 5 0 1 1-7-7L14 4.5a3.5 3.5 0 0 1 5 5L10.5 18a2 2 0 1 1-3-3L15 7.5"/></Icon>,
  send:     () => <Icon><path d="m3 12 18-8-6 18-3-8-9-2Z"/></Icon>,
  sparkles: () => <Icon><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/></Icon>,
  external: () => <Icon><path d="M14 4h6v6M20 4 10 14M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/></Icon>,
};
