use std::fs::{self, File};
use std::path::PathBuf;
use std::thread;

use tauri::{AppHandle, Manager, State};
use tokio::sync::{mpsc, oneshot};

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
    let mut csv_path: Option<PathBuf> = None;
    let mut csv_rdr: Option<csv::Reader<File>> = None;

    let data_dir = handle.path().app_data_dir().unwrap();
    let outputs_dir = data_dir.join("outputs");
    let output_file = outputs_dir.join("test.png");

    while let Some(event) = rx.blocking_recv() {
        match event {
            Event::Csv(path, resp) => {
                let f = File::open(&path)?;
                let mut rdr = csv::Reader::from_reader(f);
                let headers: Vec<String> = match rdr.headers() {
                    Ok(record) => record.iter().map(|h| h.to_string()).collect(),
                    Err(e) => {
                        eprintln!("csv error: {e}");
                        _ = resp.send(Err(e.to_string()));
                        continue;
                    }
                };
                _ = resp.send(Ok(headers));
                csv_path = Some(path);
                csv_rdr = Some(rdr);
            }
            Event::Generate(image_path, indices, resp) => {
                let Some(csv_rdr) = &mut csv_rdr else {
                    eprintln!("no csv reader");
                    continue;
                };

                let mut img = image::open(&image_path)?.to_rgba8();
                let scale = PxScale::from(92.0);
                let color = Rgba([255, 255, 0, 255]);

                let headers = csv_rdr.headers()?.clone();
                let first_row = csv_rdr.records().next().unwrap()?;

                let font = &handle.state::<AppState>().font;

                for (i, &col) in indices.iter().enumerate() {
                    let offset_y = (i as i32 + 1) * 92;
                    let k = headers[col].trim();
                    let v = first_row[col].trim();
                    let text = format!("{k}: {v}");
                    draw_text_mut(&mut img, color, 92, offset_y, scale, font, &text);
                }

                fs::create_dir_all(&outputs_dir).unwrap();
                img.save(&output_file)?;

                println!("generated {output_file:?}");

                _ = resp.send(Ok(output_file.clone()));
            }
            Event::Save(dest, resp) => {
                match fs::copy(&output_file, &dest) {
                    Ok(_) => {
                        println!("saved {dest:?}");
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

struct AppState {
    font: FontArc,
    tx: mpsc::Sender<Event>,
}

fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    const FONT_DATA: &[u8] = include_bytes!("../../public/arial.ttf");

    let (tx, rx) = mpsc::channel(100);
    {
        let handle = app.handle().clone();
        thread::spawn(move || {
            if let Err(e) = worker(handle, rx) {
                eprintln!("worker failed; cause = {e}");
            }
        });
    }

    let state = AppState {
        font: FontArc::try_from_slice(FONT_DATA)?,
        tx,
    };

    app.manage(state);

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
