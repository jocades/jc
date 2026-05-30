use std::fs::{self, File};
use std::path::{Path, PathBuf};
use std::thread;

use tauri::{Manager, State};
use tokio::sync::{mpsc, oneshot};
use tracing::{error, instrument, trace};

use ab_glyph::{FontArc, PxScale};
use image::Rgba;
use imageproc::drawing::draw_text_mut;

mod worker {
    use super::*;
    use anyhow::{ensure, Context, Result};
    use tracing::{trace_span, Instrument};

    #[derive(Debug)]
    pub enum Event {
        Csv(PathBuf, oneshot::Sender<Result<Vec<String>>>),
        Generate(
            PathBuf,
            Vec<usize>,
            Option<String>,
            oneshot::Sender<Result<PathBuf>>,
        ),
        Save(PathBuf, oneshot::Sender<Result<()>>),
    }

    pub fn spawn(font: FontArc, data_dir: &Path) -> mpsc::Sender<Event> {
        let (tx, rx) = mpsc::channel(100);

        let mut worker = Worker {
            rx,
            font,
            gen_dir: data_dir.join("gen"),
            csv: None,
        };

        thread::spawn(move || {
            if let Err(e) = worker.run() {
                error!(cause = %e, "worker error");
            }
        });

        tx
    }

    struct Worker {
        font: FontArc,
        gen_dir: PathBuf,
        rx: mpsc::Receiver<Event>,
        csv: Option<LoadedCsv>,
    }

    struct LoadedCsv {
        _path: PathBuf,
        headers: Vec<String>,
        records: Vec<csv::StringRecord>,
    }

    impl Worker {
        fn run(&mut self) -> Result<()> {
            while let Some(event) = self.rx.blocking_recv() {
                match event {
                    Event::Csv(csv_path, resp) => {
                        trace!(?csv_path, "Event::Csv");
                        _ = resp.send(self.load_csv(csv_path));
                    }
                    Event::Generate(img_path, indices, time, resp) => {
                        trace!(?img_path, ?indices, ?time, "Event::Generate");
                        _ = resp.send(self.generate(img_path, indices, time));
                    }
                    Event::Save(dest, resp) => {
                        trace!(?dest, "Event::Save");
                        _ = resp.send(self.save(dest));
                    }
                }
            }
            Ok(())
        }

        #[instrument(skip(self))]
        fn load_csv(&mut self, csv_path: PathBuf) -> Result<Vec<String>> {
            let file = File::open(&csv_path)?;
            let mut rdr = csv::Reader::from_reader(file);

            let headers: Vec<_> = rdr.headers()?.iter().map(str::to_owned).collect();

            let mut records = Vec::with_capacity(headers.len());
            for record in rdr.records() {
                records.push(record?);
            }

            self.csv = Some(LoadedCsv {
                _path: csv_path,
                headers: headers.clone(),
                records,
            });

            Ok(headers)
        }

        #[instrument(skip(self))]
        fn generate(
            &self,
            img_path: PathBuf,
            indices: Vec<usize>,
            time: Option<String>,
        ) -> Result<PathBuf> {
            ensure!(!indices.is_empty(), "Header indices are empty");

            let csv = self.csv.as_ref().context("Load a CSV before generating")?;

            let record = match &time {
                Some(stamp) => {
                    let time_index = csv
                        .headers
                        .iter()
                        .position(|header| header == "time")
                        .context("CSV missing a time column")?;

                    csv.records
                        .iter()
                        .find(|r| r.get(time_index) == Some(stamp))
                        .with_context(|| format!("No record found with time: {stamp}"))?
                }
                None => csv
                    .records
                    .first()
                    .context("CSV does not contain any records")?,
            };

            let mut img = image::open(&img_path)?.to_rgba8();
            let scale = PxScale::from(92.0);
            let color = Rgba([255, 255, 0, 255]);
            let offset = 92;

            for (i, &col) in indices.iter().enumerate() {
                let header = csv
                    .headers
                    .get(col)
                    .with_context(|| format!("Missing header for column: {col}"))?
                    .trim();

                let value = record
                    .get(col)
                    .with_context(|| format!("Missing value for column: {col}"))?
                    .trim();

                let text = format!("{header}: {value}");

                draw_text_mut(
                    &mut img,
                    color,
                    offset,
                    offset * (i as i32 + 1),
                    scale,
                    &self.font,
                    &text,
                );
            }

            fs::create_dir_all(&self.gen_dir)?;

            let out_path = self.gen_dir.join("out.png");
            img.save(&out_path)?;
            trace!(?out_path, "generated");

            Ok(out_path)
        }

        #[instrument(skip(self), level = "trace")]
        fn save(&self, dest: PathBuf) -> Result<()> {
            let src = self.gen_dir.join("out.png");
            fs::copy(&src, &dest)?;
            Ok(())
        }
    }
}

use worker::Event;

#[tauri::command]
async fn load_csv(path: PathBuf, state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let (tx, rx) = oneshot::channel();
    state.worker_tx.send(Event::Csv(path, tx)).await.unwrap();
    rx.await.unwrap().map_err(|e| e.to_string())
}

#[tauri::command]
async fn generate(
    image_path: PathBuf,
    indices: Vec<usize>,
    time: Option<String>,
    state: State<'_, AppState>,
) -> Result<PathBuf, String> {
    let (tx, rx) = oneshot::channel();
    state
        .worker_tx
        .send(Event::Generate(image_path, indices, time, tx))
        .await
        .unwrap();
    rx.await.unwrap().map_err(|e| e.to_string())
}

#[tauri::command]
async fn save(dest: PathBuf, state: State<'_, AppState>) -> Result<(), String> {
    let (tx, rx) = oneshot::channel();
    state.worker_tx.send(Event::Save(dest, tx)).await.unwrap();
    rx.await.unwrap().map_err(|e| e.to_string())
}

fn setup_logging(data_dir: &Path) {
    use tracing_subscriber::{fmt, layer::SubscriberExt};

    let log_file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(data_dir.join("trace.log"))
        .expect("failed to open log file");

    let subscriber = tracing_subscriber::registry()
        .with(fmt::layer().without_time().with_target(false))
        .with(
            fmt::layer()
                .with_writer(log_file)
                .with_ansi(false)
                .with_target(false),
        );

    tracing::subscriber::set_global_default(subscriber).expect("unable to set global subscriber");
}

struct AppState {
    worker_tx: mpsc::Sender<Event>,
}

fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let data_dir = app.path().app_data_dir()?;
    fs::create_dir_all(&data_dir)?;

    setup_logging(&data_dir);
    trace!(?data_dir);

    const FONT_DATA: &[u8] = include_bytes!("../../public/arial.ttf");
    let font = FontArc::try_from_slice(FONT_DATA)?;
    trace!("loaded font");

    let worker_tx = worker::spawn(font, &data_dir);
    trace!("spawned worker");

    app.manage(AppState { worker_tx });

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![load_csv, generate, save])
        .setup(setup)
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
