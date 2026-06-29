export default function Avatar({
  user,
  size = 40,
}: {
  user: { display_name?: string; username?: string; avatar_url: string | null };
  size?: number;
}) {
  const name = user.display_name ?? user.username ?? '?';
  if (user.avatar_url) {
    return (
      <img
        src={user.avatar_url}
        alt={name}
        style={{ width: size, height: size }}
        className="rounded-full object-cover shrink-0"
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      className="rounded-full bg-accent text-white grid place-items-center shrink-0 font-medium"
    >
      {name[0]?.toUpperCase()}
    </div>
  );
}
