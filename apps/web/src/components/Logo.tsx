/** Prato visto de cima com um "ponteiro" de medidor: o Pratômetro. */
export function Logo({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <circle cx="32" cy="32" r="30" fill="#1f7a4d" />
      <circle cx="32" cy="32" r="21" fill="#fdf8ef" />
      <path d="M32 32 L32 15 A17 17 0 0 1 47.4 39.2 Z" fill="#f2683c" />
      <circle cx="32" cy="32" r="3.5" fill="#1f7a4d" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <Logo />
      <span className="text-xl font-extrabold tracking-tight text-leaf-900">Pratômetro</span>
    </span>
  );
}
