use std::collections::HashMap;
use std::fs::{self, File};
use std::path::{Path, PathBuf};
use std::thread;

use tauri::{async_runtime::spawn_blocking, Manager, State};
use tokio::sync::{mpsc, oneshot};
use tracing::{error, trace};

use ab_glyph::{FontArc, PxScale};
use image::Rgba;
use imageproc::drawing::draw_text_mut;

mod worker {
    use super::*;
    use anyhow::{ensure, Context, Result};
    use image::{GenericImage, ImageBuffer};
    use imageproc::drawing::Canvas;

    pub enum Event {
        Csv(PathBuf, oneshot::Sender<Result<Vec<String>>>),
        Preview(PathBuf, Vec<usize>, oneshot::Sender<Result<PathBuf>>),
        Generate(Vec<PathBuf>, Vec<usize>, oneshot::Sender<Result<()>>),
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
        records_by_time: HashMap<String, usize>,
    }

    impl Worker {
        fn run(&mut self) -> Result<()> {
            while let Some(event) = self.rx.blocking_recv() {
                match event {
                    Event::Csv(csv_path, resp) => {
                        trace!(?csv_path, "Event::Csv");
                        _ = resp.send(self.load_csv(csv_path));
                    }
                    Event::Preview(image_path, columns, resp) => {
                        _ = resp.send(self.preview(image_path, columns));
                    }
                    Event::Generate(image_paths, columns, resp) => {
                        trace!(?image_paths, ?columns, "Event::Generate");
                        _ = resp.send(self.generate(image_paths, columns));
                    }
                    Event::Save(dest, resp) => {
                        trace!(?dest, "Event::Save");
                        _ = resp.send(self.save(dest));
                    }
                }
            }
            Ok(())
        }

        fn load_csv(&mut self, csv_path: PathBuf) -> Result<Vec<String>> {
            let file = File::open(&csv_path)?;
            let mut rdr = csv::Reader::from_reader(file);

            let headers: Vec<_> = rdr.headers()?.iter().map(str::to_owned).collect();

            let time_index = headers
                .iter()
                .position(|h| h == "time")
                .context("CSV missing a time column")?;

            let mut records = Vec::with_capacity(headers.len());
            let mut records_by_time = HashMap::new();
            for (index, record) in rdr.records().enumerate() {
                let record = record?;
                let time = record
                    .get(time_index)
                    .context("Missing time value in record {index}")?;
                records_by_time.insert(time.to_owned(), index);
                records.push(record);
            }

            self.csv = Some(LoadedCsv {
                _path: csv_path,
                headers: headers.clone(),
                records,
                records_by_time,
            });

            Ok(headers)
        }

        fn preview(&self, image_path: PathBuf, columns: Vec<usize>) -> Result<PathBuf> {
            let csv = self.csv.as_ref().context("Load a CSV before previewing")?;
            ensure!(!columns.is_empty(), "Column indices are empty");

            let image = render(&image_path, csv, &columns, &self.font)?;

            fs::create_dir_all(&self.gen_dir)?;
            let out_path = self.gen_dir.join("preview.png");

            image.save(&out_path)?;

            Ok(out_path)
        }

        fn generate(&self, image_paths: Vec<PathBuf>, columns: Vec<usize>) -> Result<()> {
            // ensure!(!indices.is_empty(), "Header indices are empty");

            let csv = self.csv.as_ref().context("Load a CSV before generating")?;

            Ok(())

            // let record = match &time {
            //     Some(stamp) => {
            //         let time_index = csv
            //             .headers
            //             .iter()
            //             .position(|header| header == "time")
            //             .context("CSV missing a time column")?;
            //
            //         csv.records
            //             .iter()
            //             .find(|r| r.get(time_index) == Some(stamp))
            //             .with_context(|| format!("No record found with time: {stamp}"))?
            //     }
            //     None => csv
            //         .records
            //         .first()
            //         .context("CSV does not contain any records")?,
            // };
            //
            // let mut img = image::open(&img_path)?.to_rgba8();
            // let scale = PxScale::from(92.0);
            // let color = Rgba([255, 255, 0, 255]);
            // let offset = 92;
            //
            // for (i, &col) in indices.iter().enumerate() {
            //     let header = csv
            //         .headers
            //         .get(col)
            //         .with_context(|| format!("Missing header for column: {col}"))?
            //         .trim();
            //
            //     let value = record
            //         .get(col)
            //         .with_context(|| format!("Missing value for column: {col}"))?
            //         .trim();
            //
            //     let text = format!("{header}: {value}");
            //
            //     draw_text_mut(
            //         &mut img,
            //         color,
            //         offset,
            //         offset * (i as i32 + 1),
            //         scale,
            //         &self.font,
            //         &text,
            //     );
            // }
            //
            // fs::create_dir_all(&self.gen_dir)?;
            //
            // let out_path = self.gen_dir.join("out.png");
            // img.save(&out_path)?;
            // trace!(?out_path, "generated");
            //
            // Ok(out_path)
        }

        fn generate_batch(&self, image_paths: Vec<PathBuf>, columns: Vec<usize>) -> Result<()> {
            ensure!(!columns.is_empty(), "Columns are empty");

            let csv = self.csv.as_ref().context("Load a CSV before generating")?;

            Ok(())
        }

        fn save(&self, dest: PathBuf) -> Result<()> {
            let src = self.gen_dir.join("out.png");
            fs::copy(&src, &dest)?;
            Ok(())
        }
    }

    fn parse_path_name(path: &Path) -> Result<(&str, &str, &str)> {
        let name = path
            .file_stem()
            .context("Unable to get file name")?
            .to_str()
            .context("Failed to convert file name to string")?;

        let mut parts = name.split("%");

        let session = parts.next().context("No session")?;
        let date = parts.next().context("No date")?;
        let time = parts.next().context("No time")?;

        Ok((session, date, time))
    }

    fn render(
        image_path: &Path,
        csv: &LoadedCsv,
        columns: &[usize],
        font: &FontArc,
    ) -> Result<ImageBuffer<Rgba<u8>, Vec<u8>>> {
        let (_, _, time) = parse_path_name(&image_path).context("Parse file name")?;

        let record_index = csv
            .records_by_time
            .get(time)
            .copied()
            .with_context(|| format!("No record found with time: {time}"))?;

        let record = &csv.records[record_index];

        let mut image = image::open(&image_path)?.to_rgba8();
        annotate(&mut image, csv, columns, record, font);

        Ok(image)
    }

    fn annotate(
        image: &mut ImageBuffer<Rgba<u8>, Vec<u8>>,
        csv: &LoadedCsv,
        columns: &[usize],
        record: &csv::StringRecord,
        font: &FontArc,
    ) {
        let scale = PxScale::from(92.0);
        let color = Rgba([0, 255, 0, 255]);
        let offset = 92;

        for (i, &col) in columns.iter().enumerate() {
            let k = csv.headers[col].trim();
            let v = record[col].trim();
            let text = format!("{k}: {v}");
            draw_text_mut(
                image,
                color,
                offset,
                offset * (i as i32 + 1),
                scale,
                font,
                &text,
            );
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
async fn preview(
    image_path: PathBuf,
    columns: Vec<usize>,
    state: State<'_, AppState>,
) -> Result<PathBuf, String> {
    let (tx, rx) = oneshot::channel();
    state
        .worker_tx
        .send(Event::Preview(image_path, columns, tx))
        .await
        .unwrap();
    rx.await.unwrap().map_err(|e| e.to_string())
}

#[tauri::command]
async fn generate(
    image_paths: Vec<PathBuf>,
    columns: Vec<usize>,
    on_progress: tauri::ipc::Channel<usize>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    trace!("sleeping for 5s");
    for i in 1..=5 {
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        on_progress.send(i).unwrap()
    }
    trace!("done");
    Ok(())
    // let (tx, rx) = oneshot::channel();
    // state
    //     .worker_tx
    //     .send(Event::Generate(image_paths, columns, tx))
    //     .await
    //     .unwrap();
    // rx.await.unwrap().map_err(|e| e.to_string())
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
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![load_csv, preview, generate, save])
        .setup(setup)
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
