/** The mismatch lines of a wrong_case citation, one `p` each; the caller supplies its own CSS module class. */
export function MismatchLines({
  lines,
  className,
}: Readonly<{ lines: readonly string[]; className?: string | undefined }>) {
  return (
    <>
      {lines.map((line) => (
        <p key={line} className={className}>
          {line}
        </p>
      ))}
    </>
  );
}
