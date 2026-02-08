import { cn } from '@/lib/utils';

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('animate-spin', className)}
    >
      <circle cx="12" cy="12" r="10" stroke="#888" strokeWidth="2" />
      <path
        d="M12 4a8 8 0 1 0 8 8"
        stroke="#888"
        strokeWidth="2"
        fill="none"
      />
    </svg>
  );
}
