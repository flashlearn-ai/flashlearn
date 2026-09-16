type Props = { size?: number; className?: string };

const S = ({ size = 20, className, d }: Props & { d: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <g dangerouslySetInnerHTML={{ __html: d }} />
  </svg>
);

export const Bell = (p: Props) => <S {...p} d='<path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 003.4 0"/>' />;
export const Chat = (p: Props) => <S {...p} d='<path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/>' />;
export const People = (p: Props) => <S {...p} d='<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>' />;
export const Calendar = (p: Props) => <S {...p} d='<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>' />;
export const Phone = (p: Props) => <S {...p} d='<path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.8 12.8 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.8 12.8 0 002.81.7A2 2 0 0122 16.92z"/>' />;
export const Video = (p: Props) => <S {...p} d='<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>' />;
export const AddPeople = (p: Props) => <S {...p} d='<path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>' />;
export const More = (p: Props) => <S {...p} d='<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>' />;
export const Search = (p: Props) => <S {...p} d='<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>' />;
export const Pencil = (p: Props) => <S {...p} d='<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z"/>' />;
export const File = (p: Props) => <S {...p} d='<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>' />;
export const Check = (p: Props) => <S {...p} d='<polyline points="20 6 9 17 4 12"/>' />;
export const X = (p: Props) => <S {...p} d='<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>' />;
export const Arrow = (p: Props) => <S {...p} d='<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>' />;
export const Send = (p: Props) => <S {...p} d='<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>' />;
export const Terminal = (p: Props) => <S {...p} d='<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>' />;
export const Database = (p: Props) => <S {...p} d='<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0018 0V5"/><path d="M3 12a9 3 0 0018 0"/>' />;
export const Repeat = (p: Props) => <S {...p} d='<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/>' />;
export const FileText = (p: Props) => <S {...p} d='<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="9" y2="13"/><line x1="16" y1="17" x2="9" y2="17"/>' />;
export const ChevronDown = (p: Props) => <S {...p} d='<polyline points="6 9 12 15 18 9"/>' />;

export const Bolt = ({ size = 16, className, color = "#8ff0bd" }: Props & { color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} className={className} aria-hidden>
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);
