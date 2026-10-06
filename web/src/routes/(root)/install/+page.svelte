<script lang="ts">
	import HeadComponent from '$lib/HeadComponent.svelte';
	import { DOWNLOAD_URLS } from '$lib/downloads';
</script>

<HeadComponent
	data={{
		title: 'Download · a.webo',
		description: 'Download a.webo for Windows or Linux.'
	}}
/>

<main class="hero bg-base-200 min-h-screen">
	<div class="hero-content max-w-xl text-center">
		<div>
			<a href="/"><img src="/logo.png" alt="a.webo" class="mx-auto mb-6 w-24" /></a>
			<h1 class="text-4xl font-bold">Download a.webo</h1>
			<p class="py-6">Tagged builds are available on GitHub Releases. Every commit on main also produces temporary artifacts in GitHub Actions.</p>
			<div class="flex flex-wrap justify-center gap-3">
				<a class="btn btn-primary" href={DOWNLOAD_URLS.WINDOWS_X64_INSTALLER}>Windows installer</a>
				<a class="btn btn-primary" href={DOWNLOAD_URLS.WINDOWS_X64_PORTABLE}>Windows portable</a>
				<a class="btn btn-primary" href={DOWNLOAD_URLS.LINUX_APPIMAGE_X86_64}>Linux AppImage</a>
			</div>
			<p class="mt-8"><a class="link" href={DOWNLOAD_URLS.RELEASES}>All releases</a> · <a class="link" href="https://github.com/whoslucaxs/a.webo/actions/workflows/release.yaml">Builds from main</a></p>
		</div>
	</div>
</main>
