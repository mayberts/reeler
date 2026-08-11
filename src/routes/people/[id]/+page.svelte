<script lang="ts">
	import { resolve } from '$app/paths';

	let { data } = $props();

	const person = $derived(data.person);
	const profileSrc = $derived(person.profileUrl);

	const bioParagraphs = $derived(
		person.biography ? person.biography.split(/\n+/).filter((p) => p.trim()) : []
	);
</script>

<div class="person-layout">
	<div class="sidebar">
		<div class="profile">
			{#if profileSrc}
				<img src={profileSrc} alt="" />
			{:else}
				<div class="placeholder" aria-hidden="true">{person.name.charAt(0).toUpperCase()}</div>
			{/if}
		</div>

		<div class="personal-info">
			<h2 class="section-headline">Personal Info</h2>
			{#if person.knownForDepartment}
				<div class="info-field">
					<strong>Known For</strong>
					<span>{person.knownForDepartment}</span>
				</div>
			{/if}
			{#if person.birthday}
				<div class="info-field">
					<strong>Birthday</strong>
					<span>{person.birthday}{person.deathday ? ` – ${person.deathday}` : ''}</span>
				</div>
			{/if}
			{#if person.placeOfBirth}
				<div class="info-field">
					<strong>Place of Birth</strong>
					<span>{person.placeOfBirth}</span>
				</div>
			{/if}
		</div>
	</div>

	<div class="main">
		<h1>{person.name}</h1>

		{#if bioParagraphs.length > 0}
			<h2 class="section-headline">Biography</h2>
			{#each bioParagraphs as paragraph, i (i)}
				<p class="bio-paragraph">{paragraph}</p>
			{/each}
		{/if}

		<div class="section-header-row">
			<h2 class="section-headline">Known For</h2>
			<a
				class="tmdb-link"
				href={`https://www.themoviedb.org/person/${person.tmdbId}`}
				target="_blank"
				rel="external noopener noreferrer"
			>
				See full filmography on TMDb &rarr;
			</a>
		</div>
		{#if data.knownFor.length > 0}
			<div class="known-for-grid">
				{#each data.knownFor as title (title.tmdbId)}
					{#if title.localId}
						<a class="title-card" href={resolve('/media/[id]', { id: title.localId })}>
							{#if title.posterUrl}
								<img src={title.posterUrl} alt="" loading="lazy" />
							{:else}
								<div class="placeholder small" aria-hidden="true">
									{title.title.charAt(0).toUpperCase()}
								</div>
							{/if}
							<span>{title.title}</span>
						</a>
					{:else}
						<a
							class="title-card"
							href={`https://www.themoviedb.org/${title.mediaType === 'movie' ? 'movie' : 'tv'}/${title.tmdbId}`}
							target="_blank"
							rel="external noopener noreferrer"
						>
							{#if title.posterUrl}
								<img src={title.posterUrl} alt="" loading="lazy" />
							{:else}
								<div class="placeholder small" aria-hidden="true">
									{title.title.charAt(0).toUpperCase()}
								</div>
							{/if}
							<span>{title.title}</span>
						</a>
					{/if}
				{/each}
			</div>
		{:else}
			<p class="empty">No notable credits found.</p>
		{/if}
	</div>
</div>

<style>
	.person-layout {
		display: flex;
		gap: 2rem;
		align-items: flex-start;
	}
	.sidebar {
		flex: 0 0 14rem;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}
	.profile {
		aspect-ratio: 2 / 3;
		border-radius: var(--radius);
		overflow: hidden;
		background: light-dark(#e5e4df, #232322);
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
	}
	.profile img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.placeholder {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 3rem;
		font-weight: 600;
		opacity: 0.35;
	}
	.personal-info .section-headline {
		margin-top: 0;
		font-size: 0.95rem;
	}
	.info-field {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		margin-bottom: 1rem;
		font-size: 0.85rem;
	}
	.info-field strong {
		font-weight: 700;
	}
	.info-field span {
		color: var(--ink-secondary);
	}
	.main {
		flex: 1 1 auto;
		min-width: 0;
	}
	.main h1 {
		margin: 0 0 1rem;
	}
	.bio-paragraph {
		max-width: 46rem;
	}
	.section-header-row {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.75rem;
	}
	.section-header-row .section-headline {
		margin: 2.25rem 0 0;
	}
	.tmdb-link {
		border: 1px solid light-dark(rgba(0, 0, 0, 0.15), rgba(255, 255, 255, 0.18));
		border-radius: var(--radius-sm);
		padding: 0.2rem 0.6rem;
		font-size: 0.75rem;
		font-weight: 700;
		text-decoration: none;
		color: var(--ink-secondary);
	}
	.tmdb-link:hover {
		border-color: var(--accent);
		color: var(--accent);
	}
	.known-for-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr));
		gap: 1rem;
		margin: 1rem 0 2rem;
	}
	.title-card {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		text-decoration: none;
		color: inherit;
		font-size: 0.85rem;
		font-weight: 600;
	}
	.title-card img,
	.title-card .placeholder.small {
		aspect-ratio: 2 / 3;
		border-radius: var(--radius);
		overflow: hidden;
		width: 100%;
		object-fit: cover;
		display: block;
		background: light-dark(#e5e4df, #232322);
	}
	.placeholder.small {
		font-size: 1.75rem;
	}

	@media (max-width: 40rem) {
		.person-layout {
			flex-direction: column;
		}
		.sidebar {
			flex: 0 0 auto;
			flex-direction: row;
			width: 100%;
		}
		.profile {
			flex: 0 0 8rem;
		}
	}
</style>
