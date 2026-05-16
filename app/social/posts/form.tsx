"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { createSocialPost, generateSocialCaption } from "@/lib/social/post-actions";

type Establishment = { id: string; name: string };

const PLATFORMS = [
  { id: "facebook", label: "Facebook" },
  { id: "instagram", label: "Instagram" },
  { id: "twitter", label: "X (Twitter)" },
  { id: "linkedin", label: "LinkedIn" },
] as const;

export function CreatePostForm({ establishments }: { establishments: Establishment[] }) {
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState<"professional" | "friendly" | "playful" | "informative">("friendly");
  const [platforms, setPlatforms] = useState<string[]>(["facebook"]);
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaType, setMediaType] = useState<"image" | "video" | "reel">("image");
  const [scheduledFor, setScheduledFor] = useState("");
  const [establishmentId, setEstablishmentId] = useState(establishments[0]?.id ?? "");

  const [aiPending, startAiTransition] = useTransition();
  const [savePending, startSaveTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function togglePlatform(id: string) {
    setPlatforms((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }

  function handleAiGenerate() {
    setError(null);
    if (platforms.length === 0) {
      setError("Pick at least one platform first.");
      return;
    }
    const fd = new FormData();
    fd.set("platforms", platforms.join(","));
    if (topic) fd.set("topic", topic);
    fd.set("tone", tone);
    startAiTransition(async () => {
      try {
        const r = await generateSocialCaption(fd);
        setCaption(r.caption);
        setHashtags(r.hashtags.join(" "));
      } catch (e) {
        setError(e instanceof Error ? e.message : "AI failed");
      }
    });
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (platforms.length === 0) {
      setError("Pick at least one platform");
      return;
    }
    if (!caption.trim()) {
      setError("Caption is required");
      return;
    }
    const fd = new FormData();
    fd.set("caption", caption);
    fd.set("hashtags", hashtags);
    fd.set("platforms", platforms.join(","));
    if (mediaUrl) fd.set("mediaUrl", mediaUrl);
    fd.set("mediaType", mediaType);
    if (scheduledFor) fd.set("scheduledFor", new Date(scheduledFor).toISOString());
    if (establishmentId) fd.set("establishmentId", establishmentId);

    startSaveTransition(async () => {
      try {
        await createSocialPost(fd);
        setSuccess(scheduledFor ? "Scheduled!" : "Saved as draft (will post once OAuth is configured).");
        setCaption("");
        setHashtags("");
        setMediaUrl("");
        setScheduledFor("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      }
    });
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div>
        <span className="text-sm font-medium">Platforms</span>
        <div className="mt-1 flex flex-wrap gap-2">
          {PLATFORMS.map((p) => (
            <label key={p.id} className="flex items-center gap-1 rounded-md border bg-white px-3 py-1 text-sm">
              <input
                type="checkbox"
                checked={platforms.includes(p.id)}
                onChange={() => togglePlatform(p.id)}
              />
              {p.label}
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="font-medium">AI topic (optional)</span>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            maxLength={200}
            placeholder="Friday promotion, new menu item, customer testimonial"
            className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Tone</span>
          <select
            value={tone}
            onChange={(e) => setTone(e.target.value as typeof tone)}
            className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
          >
            <option value="friendly">Friendly</option>
            <option value="professional">Professional</option>
            <option value="playful">Playful</option>
            <option value="informative">Informative</option>
          </select>
        </label>
      </div>

      <Button type="button" variant="outline" size="sm" disabled={aiPending} onClick={handleAiGenerate}>
        {aiPending ? "Generating…" : "✨ Generate caption + hashtags with AI"}
      </Button>

      <label className="block text-sm">
        <span className="font-medium">Caption</span>
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          rows={5}
          maxLength={3000}
          placeholder="Write your post here…"
          className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
        />
      </label>

      <label className="block text-sm">
        <span className="font-medium">Hashtags</span>
        <input
          value={hashtags}
          onChange={(e) => setHashtags(e.target.value)}
          maxLength={500}
          placeholder="#localbiz #springfield #coffee"
          className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="font-medium">Media URL (optional)</span>
          <input
            type="url"
            value={mediaUrl}
            onChange={(e) => setMediaUrl(e.target.value)}
            maxLength={2000}
            placeholder="https://yourdomain.com/image.jpg"
            className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Media type</span>
          <select
            value={mediaType}
            onChange={(e) => setMediaType(e.target.value as typeof mediaType)}
            className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
          >
            <option value="image">Image</option>
            <option value="video">Video</option>
            <option value="reel">Reel (9:16)</option>
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="font-medium">Establishment (optional)</span>
          <select
            value={establishmentId}
            onChange={(e) => setEstablishmentId(e.target.value)}
            className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
          >
            <option value="">All locations</option>
            {establishments.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium">Schedule for</span>
          <input
            type="datetime-local"
            value={scheduledFor}
            onChange={(e) => setScheduledFor(e.target.value)}
            className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
          />
          <span className="mt-1 block text-xs text-muted-foreground">Leave blank for draft</span>
        </label>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && <p className="text-sm text-emerald-700">{success}</p>}

      <div className="flex gap-2">
        <Button type="submit" disabled={savePending}>
          {savePending ? "Saving…" : scheduledFor ? "Schedule post" : "Save draft"}
        </Button>
      </div>
    </form>
  );
}
