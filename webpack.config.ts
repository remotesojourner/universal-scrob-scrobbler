import 'dotenv/config';
import { ServiceValues } from '@models/Service';
import archiver from 'archiver';
import CircularDependencyPlugin from 'circular-dependency-plugin';
import DotenvPlugin from 'dotenv-webpack';
import fs from 'fs-extra';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import path from 'path';
import { TsconfigPathsPlugin } from 'tsconfig-paths-webpack-plugin';
import { Manifest as WebExtManifest } from 'webextension-polyfill';
import webpack, { ProgressPlugin } from 'webpack';
import packageJson = require('./package.json');

interface Environment {
	development: boolean;
	production: boolean;
	test: boolean;
	watch: boolean;
}

const BASE_PATH = process.cwd();
const loaders = {
	css: {
		loader: 'css-loader',
	},
	style: {
		loader: 'style-loader',
		options: {
			injectType: 'singletonStyleTag',
			insert: 'html',
		},
	},
};

class RunAfterBuildPlugin {
	callback: () => Promise<void>;

	constructor(callback: () => Promise<void>) {
		this.callback = callback;
	}

	apply = (compiler: webpack.Compiler) => {
		compiler.hooks.afterEmit.tapPromise('RunAfterBuild', this.callback);
	};
}

const plugins = {
	circularDependency: CircularDependencyPlugin,
	dotenv: DotenvPlugin,
	html: HtmlWebpackPlugin,
	progress: ProgressPlugin,
	runAfterBuild: RunAfterBuildPlugin,
	tsConfigPaths: TsconfigPathsPlugin,
};

const services: Record<string, ServiceValues> = {};
const serviceEntries: Record<string, string[]> = {};
const serviceImports: string[] = [];
const apiImports: string[] = [];

const loadServices = () => {
	const servicesDir = path.resolve(BASE_PATH, 'src', 'services');
	const serviceIds = fs.readdirSync(servicesDir).filter((fileName) => !fileName.endsWith('.ts'));
	for (const serviceId of serviceIds) {
		const serviceKey = serviceId
			.split('-')
			.map((word) => `${word[0].toUpperCase()}${word.slice(1)}`)
			.join('');
		const serviceDir = path.resolve(servicesDir, serviceId);
		const servicePath = path.resolve(serviceDir, `${serviceKey}Service.ts`);
		const serviceFile = fs.readFileSync(servicePath, 'utf-8');
		const { serviceDefinition } =
			/Service\((?<serviceDefinition>[\S\s]+?)\)/m.exec(serviceFile)?.groups ?? {};
		if (!serviceDefinition) {
			throw new Error(`No service matches for ${serviceId}`);
		}
		const service = JSON.parse(
			serviceDefinition
				.replace(/\r?\n|\r|\t/g, '')
				.replace(/(?<begin>[{,])(?<end>\w+?):/g, '$<begin>"$<end>":')
				.replace(/'/g, '"')
				.replace(/,(?<end>[\]}])/g, '$<end>')
		) as ServiceValues;
		services[service.id] = service;

		if (service.hasScrobbler) {
			serviceEntries[serviceId] = [`./src/services/${serviceId}/${serviceId}.ts`];
		}
		serviceImports.push(`import '@/${serviceId}/${serviceKey}Service';`);
		apiImports.push(`import '@/${serviceId}/${serviceKey}Api';`);
	}
};

const getWebpackConfig = (env: Environment): webpack.Configuration => {
	loadServices();

	let mode: 'production' | 'development';
	if (env.production) {
		mode = 'production';
	} else {
		mode = 'development';
	}
	return {
		devtool: env.production ? false : 'source-map',
		entry: {
			background: ['./src/modules/background/background.ts'],
			popup: ['./src/modules/popup/popup.tsx'],
			history: ['./src/modules/history/history.tsx'],
			options: ['./src/modules/options/options.tsx'],
			'kino-pub-auth': ['./src/modules/kino-pub-auth/kino-pub-auth.tsx'],
			...serviceEntries,
		},
		mode,
		module: {
			rules: [
				{
					test: /apis\.ts$/,
					loader: 'string-replace-loader',
					options: {
						search: '// @import-services-apis',
						replace: apiImports.join('\n'),
					},
				},
				{
					test: /services\.ts$/,
					loader: 'string-replace-loader',
					options: {
						search: '// @import-services',
						replace: serviceImports.join('\n'),
					},
				},
				{
					test: /\.woff2?$/,
					type: 'asset/resource',
					generator: {
						filename: 'fonts/[name][ext]',
					},
				},
				{
					test: /\.pug$/,
					loader: 'pug-loader',
				},
				{
					test: /\.(?:jpg|png)$/,
					type: 'asset/resource',
					generator: {
						filename: 'images/[name][ext]',
					},
				},
				{
					test: /\.css$/,
					use: [loaders.style, loaders.css],
				},
				{
					test: /\.(?:t|j)sx?$/,
					exclude: /(?:node_modules|bower_components)/,
					loader: 'babel-loader',
					options: {
						envName: env.test ? 'test' : mode,
					},
				},
			],
		},
		output: {
			filename: '[name].js',
			path: path.resolve(BASE_PATH, 'build', 'output'),
			clean: true,
		},
		plugins: (() => {
			const titlePrefix = env.production ? '' : '[dev] ';
			return [
				new plugins.progress(),
				new plugins.html({
					template: './src/templates/main.pug',
					templateParameters: {
						title: `${titlePrefix}Universal Scrob Scrobbler - Popup`,
						script: 'popup.js',
					},
					filename: 'popup.html',
					inject: false,
				}),
				new plugins.html({
					template: './src/templates/main.pug',
					templateParameters: {
						title: `${titlePrefix}Universal Scrob Scrobbler - History`,
						script: 'history.js',
					},
					filename: 'history.html',
					inject: false,
				}),
				new plugins.html({
					template: './src/templates/main.pug',
					templateParameters: {
						title: `${titlePrefix}Universal Scrob Scrobbler - Options`,
						script: 'options.js',
					},
					filename: 'options.html',
					inject: false,
				}),
				new plugins.html({
					template: './src/templates/main.pug',
					templateParameters: {
						title: `${titlePrefix}Universal Scrob Scrobbler - Kino.pub Auth`,
						script: 'kino-pub-auth.js',
					},
					filename: 'kino-pub-auth.html',
					inject: false,
				}),
				new plugins.circularDependency({
					exclude: /node_modules/,
					include: /src/,
					failOnError: true,
				}),
				new plugins.dotenv({
					systemvars: true,
				}),
				...(env.test ? [] : [new plugins.runAfterBuild(() => runFinalSteps(env))]),
			];
		})(),
		resolve: {
			extensions: ['.js', '.ts', '.tsx', '.json'],
			plugins: [new plugins.tsConfigPaths()],
		},
		watch: !!(env.development && env.watch),
		watchOptions: {
			aggregateTimeout: 1000,
			ignored: /node_modules/,
			poll: 1000,
		},
		node: {
			global: false,
		},
	};
};

const getManifest = (browserName: string, isDev: boolean): string => {
	const manifest: Partial<WebExtManifest.WebExtensionManifest> & {
		key?: string;
		optional_host_permissions?: string[];
		browser_specific_settings?: {
			gecko?: {
				id?: string;
				strict_min_version?: string;
				strict_max_version?: string;
				update_url?: string;
				data_collection_permissions?: {
					required?: string[];
				};
			};
		};
	} = {
		name: isDev ? '[dev] Universal Scrob Scrobbler' : 'Universal Scrob Scrobbler',
		version: packageJson.version,
		description: '__MSG_appDescription__',
		icons: {
			16: 'images/uts-icon-16.png',
			128: 'images/uts-icon-128.png',
		},
		default_locale: 'en',
	};
	switch (browserName) {
		case 'chrome':
		case 'safari': {
			const isSafari = browserName === 'safari';
			manifest.manifest_version = 3;
			manifest.background = isSafari
				? { scripts: ['background.js'] }
				: { service_worker: 'background.js' };
			manifest.optional_permissions = isSafari ? [] : ['notifications'];
			manifest.optional_host_permissions = ['http://*/*', 'https://*/*'];
			manifest.permissions = isSafari
				? ['alarms', 'scripting', 'storage', 'unlimitedStorage']
				: ['alarms', 'identity', 'scripting', 'storage', 'unlimitedStorage'];
			manifest.host_permissions = [
				...Object.values(services)
					.map((service) => service.hostPatterns)
					.flat(),
			];
			manifest.action = {
				default_icon: {
					19: 'images/uts-icon-19.png',
					38: 'images/uts-icon-38.png',
				},
				default_popup: 'popup.html',
				default_title: isDev ? '[dev] Universal Scrob Scrobbler' : 'Universal Scrob Scrobbler',
			};
			if (!isSafari && process.env.CHROME_EXTENSION_KEY) {
				manifest.key = process.env.CHROME_EXTENSION_KEY;
			}
			break;
		}
		case 'firefox': {
			manifest.manifest_version = 2;
			manifest.background = {
				scripts: ['background.js'],
				persistent: false,
			};
			manifest.optional_permissions = [
				'cookies',
				'notifications',
				'tabs',
				'webRequest',
				'webRequestBlocking',
				...Object.values(services)
					.map((service) => service.hostPatterns)
					.flat(),
			];
			manifest.permissions = ['alarms', 'identity', 'storage', 'unlimitedStorage', '<all_urls>'];
			manifest.browser_action = {
				default_icon: {
					19: 'images/uts-icon-19.png',
					38: 'images/uts-icon-38.png',
				},
				default_popup: 'popup.html',
				default_title: isDev ? '[dev] Universal Scrob Scrobbler' : 'Universal Scrob Scrobbler',
			};
			manifest.browser_specific_settings = {
				gecko: {
					id: process.env.FIREFOX_EXTENSION_ID || 'universal-scrob-scrobbler@extension',
					strict_min_version: '142.0',
					data_collection_permissions: {
						required: ['none'],
					},
				},
			};
			break;
		}
	}
	return JSON.stringify(manifest, null, 2);
};

const runFinalSteps = async (env: Environment) => {
	const localesDir = path.resolve(BASE_PATH, 'src', '_locales');
	const outputLocalesDir = path.resolve(BASE_PATH, 'build', 'output', '_locales');
	if (await fs.pathExists(localesDir)) {
		await fs.copy(localesDir, outputLocalesDir);
	}

	const browsers = ['chrome', 'firefox', 'safari'];
	for (const browserName of browsers) {
		const browserDir = path.resolve(BASE_PATH, 'build', browserName);
		await fs.copy(path.resolve(BASE_PATH, 'build', 'output'), browserDir);
		await fs.writeFile(
			path.resolve(browserDir, 'manifest.json'),
			getManifest(browserName, env.development)
		);
		if (env.production) {
			const distDir = path.resolve(BASE_PATH, 'dist');
			await fs.ensureDir(distDir);
			const zipPath = path.resolve(distDir, `${browserName}.zip`);
			try {
				await fs.remove(zipPath);
				const archive = archiver('zip');
				const zipStream = fs.createWriteStream(zipPath);
				const zipPromise = new Promise<void>((resolve, reject) => {
					zipStream.on('close', resolve);
					zipStream.on('error', reject);
					archive.on('error', reject);
				});
				archive.pipe(zipStream);
				archive.directory(browserDir, false);
				await archive.finalize();
				await zipPromise;
			} catch (err) {
				console.warn(`[Build] Could not update ${browserName}.zip (file may be open/locked):`, err);
			}
		}
	}
};

export default (env: Environment): webpack.Configuration => {
	return getWebpackConfig(env);
};
