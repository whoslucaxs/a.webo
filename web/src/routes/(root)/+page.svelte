<script lang="ts">
	import HeadComponent from '$lib/HeadComponent.svelte';
</script>

<HeadComponent
	data={{
		title: 'a.webo',
		description: 'Voice channels, chat, camera, and screen sharing for Windows and Linux.'
	}}
/>

<main class="hero bg-base-200 min-h-screen">
	<div class="hero-content max-w-xl text-center">
		<div>
			<img src="/logo.png" alt="a.webo" class="mx-auto mb-6 w-36" />
			<h1 class="text-5xl font-bold">a.webo</h1>
			<p class="py-6">Create a temporary or permanent voice channel. Share a link, then talk, chat, and share your camera or screen.</p>
			<p>Calls use encrypted WebRTC connections. The room server helps participants connect; TURN relays encrypted media when needed.</p>
			<div class="mt-8 flex flex-wrap justify-center gap-3">
				<a class="btn btn-primary" href="/install">Download</a>
				<a class="btn" href="https://github.com/whoslucaxs/JanjaShare">Source code</a>
			</div>
		</div>
	</div>
</main>
