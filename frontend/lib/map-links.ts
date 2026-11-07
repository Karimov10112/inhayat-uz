export function mapLinks(name: string, address: string) {
  const query = `${name}, ${address}, Uzbekistan`;
  return {
    search: `https://www.google.com/maps/search/?${new URLSearchParams({ api: '1', query })}`,
    directions: `https://www.google.com/maps/dir/?${new URLSearchParams({ api: '1', destination: query })}`,
    embed: `https://maps.google.com/maps?${new URLSearchParams({ q: query, output: 'embed', hl: 'uz', z: '15' })}`,
  };
}
