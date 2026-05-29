use std::fs::{self, File};
use std::path::{Path, PathBuf};
use std::thread;

use tauri::{AppHandle, Manager, State};
use tokio::sync::{mpsc, oneshot};
use tracing::{error, trace};

use ab_glyph::{FontArc, PxScale};
use image::Rgba;
use imageproc::drawing::draw_text_mut;

#[derive(Debug)]
enum Event {
    Csv(PathBuf, oneshot::Sender<Result<Vec<String>, String>>),
    Generate(
        PathBuf,
        Vec<usize>,
        oneshot::Sender<Result<PathBuf, String>>,
    ),
    Save(PathBuf, oneshot::Sender<Result<PathBuf, String>>),
}

fn worker(
    handle: AppHandle,
    mut rx: mpsc::Receiver<Event>,
) -> Result<(), Box<dyn std::error::Error>> {
    let state = handle.state::<AppState>();

    let mut csv_rdr: Option<csv::Reader<File>> = None;

    let outputs_dir = state.data_dir.join("outputs");
    let output_file = outputs_dir.join("test.png");

    while let Some(event) = rx.blocking_recv() {
        match event {
            Event::Csv(path, resp) => {
                let f = File::open(&path)?;
                let mut rdr = csv::Reader::from_reader(f);
                let headers: Vec<String> = match rdr.headers() {
                    Ok(record) => record.iter().map(|h| h.to_string()).collect(),
                    Err(e) => {
                        error!(cause = %e, "csv error");
                        _ = resp.send(Err(e.to_string()));
                        continue;
                    }
                };
                _ = resp.send(Ok(headers));
                csv_rdr = Some(rdr);
            }
            Event::Generate(image_path, indices, resp) => {
                let Some(csv_rdr) = &mut csv_rdr else {
                    error!("no csv reader");
                    continue;
                };

                let mut img = image::open(&image_path)?.to_rgba8();
                let scale = PxScale::from(92.0);
                let color = Rgba([255, 255, 0, 255]);

                let headers = csv_rdr.headers()?.clone();
                let first_row = csv_rdr.records().next().unwrap()?;

                for (i, &col) in indices.iter().enumerate() {
                    let offset_y = (i as i32 + 1) * 92;
                    let k = headers[col].trim();
                    let v = first_row[col].trim();
                    let text = format!("{k}: {v}");
                    draw_text_mut(&mut img, color, 92, offset_y, scale, &state.font, &text);
                }

                fs::create_dir_all(&outputs_dir).unwrap();
                img.save(&output_file)?;

                trace!(?output_file, "generated");

                _ = resp.send(Ok(output_file.clone()));
            }
            Event::Save(dest, resp) => {
                match fs::copy(&output_file, &dest) {
                    Ok(_) => {
                        trace!(?dest, "saved");
                        let _ = resp.send(Ok(dest));
                    }
                    Err(e) => _ = resp.send(Err(e.to_string())),
                };
            }
        }
    }
    Ok(())
}

#[tauri::command]
async fn load_csv(path: PathBuf, state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let (tx, rx) = oneshot::channel();
    state.tx.send(Event::Csv(path, tx)).await.unwrap();
    rx.await.unwrap()
}

#[tauri::command]
async fn generate(
    image_path: PathBuf,
    indices: Vec<usize>,
    state: State<'_, AppState>,
) -> Result<PathBuf, String> {
    let (tx, rx) = oneshot::channel();
    state
        .tx
        .send(Event::Generate(image_path, indices, tx))
        .await
        .unwrap();
    rx.await.unwrap()
}

#[tauri::command]
async fn save(dest: PathBuf, state: State<'_, AppState>) -> Result<PathBuf, String> {
    let (tx, rx) = oneshot::channel();
    state.tx.send(Event::Save(dest, tx)).await.unwrap();
    rx.await.unwrap()
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
    font: FontArc,
    data_dir: PathBuf,
    tx: mpsc::Sender<Event>,
}

fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let data_dir = app.path().app_data_dir()?;
    trace!(?data_dir);

    setup_logging(&data_dir);

    const FONT_DATA: &[u8] = include_bytes!("../../public/arial.ttf");
    let font = FontArc::try_from_slice(FONT_DATA)?;

    trace!("loaded font data");

    let (tx, rx) = mpsc::channel(100);
    app.manage(AppState { data_dir, font, tx });

    {
        let handle = app.handle().clone();
        thread::spawn(move || {
            if let Err(e) = worker(handle, rx) {
                error!(cause = %e, "worker error");
            }
        });
        trace!("spawned worker");
    }

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
