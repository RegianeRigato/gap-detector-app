from flask import Flask, request, jsonify, session, redirect, url_for, render_template
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from flask_mail import Mail, Message
from flask_cors import CORS
import traceback
import yfinance as yf
from datetime import datetime, timedelta, time
import pandas as pd
import uuid
import os
from dotenv import load_dotenv

load_dotenv()  # Carga variables de entorno desde .env

app = Flask(__name__)

# Configuración SQLite
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///users.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(minutes=60)

# 🔐 Clave secreta para sesiones
app.secret_key = os.getenv('SECRET_KEY', 'insecure-default-key')

# 📬 Configuración del correo
app.config['MAIL_SERVER'] = os.getenv('MAIL_SERVER')
app.config['MAIL_PORT'] = int(os.getenv('MAIL_PORT', 587))
app.config['MAIL_USE_TLS'] = os.getenv('MAIL_USE_TLS', 'true').lower() in ['true', '1', 'yes']
app.config['MAIL_USERNAME'] = os.getenv('MAIL_USERNAME')
app.config['MAIL_PASSWORD'] = os.getenv('MAIL_PASSWORD')
app.config['MAIL_DEFAULT_SENDER'] = os.getenv('MAIL_DEFAULT_SENDER')

# Inicializar extensiones
db = SQLAlchemy(app)
mail = Mail(app)

# Modelo de usuario
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    role = db.Column(db.String(20), default='user')  # user, intermedio, vip, prueba
    is_active = db.Column(db.Boolean, default=True)
    is_logged_in = db.Column(db.Boolean, default=False)
    session_id = db.Column(db.String(120))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)  # NUEVO

from functools import wraps

from flask import has_request_context

# Decorador para validar sesiones y bloquear rol "prueba" tras 7 días
def check_active_session(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not has_request_context():
            return f(*args, **kwargs)

        user_id = session.get('user_id')
        session_id = session.get('session_id')

        if user_id:
            user = User.query.get(user_id)
            if not user or not user.is_logged_in or user.session_id != session_id:
                session.clear()
                return jsonify({'error': 'Sesion invalida o expirada'}), 401

            if user.role == 'prueba' and user.created_at + timedelta(days=7) < datetime.utcnow():
                user.is_active = False
                user.is_logged_in = False
                user.session_id = None
                db.session.commit()
                session.clear()
                return jsonify({'error': 'Tu periodo de prueba ha expirado'}), 403

        return f(*args, **kwargs)
    return decorated_function

# Decorador para restringir rutas a ciertos roles
def role_required(allowed_roles):
    def decorator(f):
        @wraps(f)
        def wrapped(*args, **kwargs):
            user_id = session.get('user_id')
            if not user_id:
                return jsonify({'error': 'No autenticado'}), 401
            user = User.query.get(user_id)
            if user.role not in allowed_roles:
                return jsonify({'error': 'Acceso no autorizado'}), 403
            return f(*args, **kwargs)
        return wrapped
    return decorator

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user_id = session.get('user_id')
        if not user_id:
            return jsonify({'error': 'No autenticado'}), 401

        user = User.query.get(user_id)
        if not user or user.role != 'admin':
            return jsonify({'error': 'Acceso no autorizado'}), 403

        return f(*args, **kwargs)
    return decorated_function


# Rutas protegidas y autenticación
@app.route('/')
def home():
    return redirect('/login.html')

@app.route('/login.html')
def login_page():
    return render_template('login.html')

@app.route('/admin.html')
@check_active_session
def admin_page():
    user_id = session.get('user_id')
    if not user_id:
        return redirect('/login.html')
    
    user = User.query.get(user_id)
    if user.role != 'admin':
        return redirect('/index.html')
    
    users = User.query.all()
    return render_template('admin.html', user=user, users=users)

@app.route('/index.html')
@check_active_session
def index_page():
    user_id = session.get('user_id')
    if not user_id:
        return redirect('/login.html')
    return render_template('index.html')

@app.route('/create_user', methods=['POST'])
def create_user():
    data = request.get_json()
    username = data['username']
    password = data['password']
    email = data['email']
    role = data.get('role', 'user')

    if User.query.filter_by(username=username).first():
        return jsonify({'error': 'Usuario ya existe'}), 400

    password_hash = generate_password_hash(password)
    new_user = User(username=username, password_hash=password_hash, email=email, role=role)
    db.session.add(new_user)
    db.session.commit()

    return jsonify({'message': 'Usuario creado correctamente'})

@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data['username']
    password = data['password']

    user = User.query.filter_by(username=username, is_active=True).first()
    
    if not user or not check_password_hash(user.password_hash, password):
        return jsonify({'error': 'Credenciales inválidas'}), 401
    
    # Verificar si el usuario ya está conectado
    if user.is_logged_in:
        return jsonify({'error': 'Este usuario ya tiene una sesión activa'}), 403

    # Registrar la sesión con un ID único generado
    new_session_id = str(uuid.uuid4())
    user.is_logged_in = True
    user.session_id = new_session_id
    db.session.commit()

    session['user_id'] = user.id
    session['session_id'] = new_session_id
    session.permanent = True  # 🕒 activa expiración automática

    return jsonify({
        'message': 'Login exitoso', 
        'success': True,
        'role': user.role,
        'session_id': new_session_id
    })

@app.route('/logout', methods=['POST'])
def logout():
    user_id = session.get('user_id')
    if user_id:
        user = User.query.get(user_id)
        if user:
            user.is_logged_in = False
            user.session_id = None
            db.session.commit()
    session.clear()  # Esto ya limpia todo, pero por claridad puedes hacer:
    session.pop('user_id', None)
    session.pop('session_id', None)
    return jsonify({'message': 'Sesión cerrada'})

@app.route('/get_users', methods=['GET'])
def get_users():
    users = User.query.all()
    return jsonify([
        {
            'id': u.id,
            'username': u.username,
            'email': u.email,
            'role': u.role,
            'is_active': u.is_active,
            'is_logged_in': u.is_logged_in,
            'created_at': u.created_at.strftime('%Y-%m-%d') if u.created_at else 'N/A'
        } for u in users
    ])

@app.route('/toggle_user/<int:user_id>', methods=['POST'])
def toggle_user(user_id):
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'Usuario no encontrado'}), 404
    user.is_active = not user.is_active
    db.session.commit()
    return jsonify({'message': f'Usuario {"activado" if user.is_active else "desactivado"}'})

@app.route('/update_password/<int:user_id>', methods=['POST'])
def update_password(user_id):
    # Verificar que el usuario que hace la solicitud está autenticado
    current_user_id = session.get('user_id')
    if not current_user_id:
        return jsonify({'error': 'No autorizado'}), 401
    
    current_user = User.query.get(current_user_id)
    if not current_user:
        return jsonify({'error': 'Usuario no encontrado'}), 404
    
    # Solo administradores o el propio usuario pueden cambiar contraseñas
    if current_user.role != 'admin' and current_user.id != user_id:
        return jsonify({'error': 'No tienes permisos para esta acción'}), 403
    
    data = request.get_json()
    new_password = data.get('new_password')
    
    if not new_password:
        return jsonify({'error': 'Nueva contraseña no proporcionada'}), 400
    
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'Usuario no encontrado'}), 404
    
    user.password_hash = generate_password_hash(new_password)
    db.session.commit()
    
    return jsonify({'message': 'Contraseña actualizada correctamente'})

@app.route('/force_logout_inactive', methods=['POST'])
def force_logout_inactive():
    users = User.query.filter_by(is_logged_in=True).all()
    count = 0
    for user in users:
        # Verifica si ese session_id ya no está en ninguna sesión activa (cookie ya no existe)
        # Aquí simplemente limpiamos todos los que estén en True, ya que las sesiones expiradas ya no llegan con cookies.
        user.is_logged_in = False
        user.session_id = None
        count += 1
    db.session.commit()
    return jsonify({'message': f'Sesiones limpiadas: {count}'})

@app.route('/calculadora')
@check_active_session
@role_required(['intermedio', 'vip'])
def calculadora():
    return render_template('calculadora.html')

@app.route('/backtesting')
@check_active_session
@role_required(['vip'])
def backtesting():
    return render_template('backtesting.html')


# Funciones auxiliares para gaps
# Función para obtener datos extendidos
def get_extended_hours_data(ticker):
    try:
        stock = yf.Ticker(ticker)
        hist = stock.history(period="2d", interval="1m", prepost=True)
        
        if not hist.empty:
            last_day = hist[hist.index.date == hist.index.date[-2]]
            return last_day.iloc[-1]["Close"] if not last_day.empty else None
    except Exception:
        return None

# Función para calcular flujo de dinero
def calculate_money_flow(df):
    df['Typical Price'] = (df['High'] + df['Low'] + df['Close']) / 3
    df['Money Flow'] = df['Typical Price'] * df['Volume']
    return {
        'positive_flow': df[df['Close'] > df['Open']]['Money Flow'].sum(),
        'negative_flow': df[df['Close'] < df['Open']]['Money Flow'].sum()
    }

# Función para estadísticas de gaps
def calculate_gap_stats(df, significant_gaps):
    if df.empty or significant_gaps.empty:
        return None
    
    stats = {
        'total': len(significant_gaps),
        'closed_above': 0,
        'closed_below': 0
    }
    
    for idx, row in significant_gaps.iterrows():
        if row['Close']  >= row['Open']:
            stats['closed_above'] += 1
        elif row['Close'] < row['Open']:
            stats['closed_below'] += 1
    
    stats['pct_above'] = (stats['closed_above'] / stats['total']) * 100
    stats['pct_below'] = (stats['closed_below'] / stats['total']) * 100
    
    return stats

# Endpoint detectar patrones para Playbook
def detectar_patron_gap(gap, company, historical_data=None):
    """
    Detecta patrones de trading basados en gaps según los criterios de los PDFs.
    
    Args:
        gap (dict): Datos del gap actual
        company (dict): Datos fundamentales de la compañía
        historical_data (dict, optional): Datos históricos para análisis de tendencia y volumen
    
    Returns:
        list: Lista de patrones detectados
    """
    patrones = []

    # Extraer y procesar datos básicos
    float_shares = company.get("floatShares", 0)
    short_interest = company.get("shortInterest", "0").replace('%', '')
    insider_own = company.get("insiderOwn", "0").replace('%', '')
    gap_pct = abs(gap.get("gap_percent", 0))
    volume = gap.get("volume", 0)
    prev_volume = gap.get("prev_volume", 0)  # Volumen del día anterior
    dollar_volume = gap.get("dollar_volume", 0)
    direction = gap.get("direction", "")
    
    # Cálculos de spikes y porcentajes
    open_price = gap.get("open", 0)
    high_price = gap.get("high", 0)
    low_price = gap.get("low", 0)
    close_price = gap.get("close", 0)
    prev_close = gap.get("prev_close", 0)
    pm_high = gap.get("pm_high", 0)  # High del premarket
    vwap = gap.get("vwap", 0)  # VWAP actual
    
    high_spike = (high_price - open_price) / open_price * 100 if open_price else 0
    low_spike = (low_price - open_price) / open_price * 100 if open_price else 0
    
    # Extensión desde el cierre anterior
    extension_from_prev_close = (high_price - prev_close) / prev_close * 100 if prev_close else 0
    
    # Determinar si está bajo VWAP
    below_vwap = close_price < vwap if vwap else False
    
    # Analizar si hay tendencia bajista (requiere historical_data)
    bearish_trend = False
    if historical_data and len(historical_data.get("closes", [])) > 10:
        # Lógica simplificada: si ha estado bajando en los últimos 10 días
        closes = historical_data["closes"][-10:]
        if closes[0] > closes[-1]:
            bearish_trend = True
    
    # Verificar si hay resistencia histórica significativa
    has_resistance_above = False
    resistance_level = 0
    if historical_data:
        # Lógica para detectar niveles de resistencia con volumen alto
        # (Simplificado para el ejemplo)
        has_resistance_above = historical_data.get("has_resistance_above", False)
        resistance_level = historical_data.get("resistance_level", 0)
    
    # Comprobar la sobre extensión
    is_overextended = extension_from_prev_close > 100  # Más del 100% desde el cierre anterior
    
    # Verificar volumen relativo al histórico
    high_volume = volume > prev_volume * 1.5 if prev_volume else False
    
    try:
        float_val = float(str(float_shares).replace(',', '').replace('.', ''))
        short_val = float(short_interest)
        insider_val = float(insider_own)
    except:
        float_val = 0
        short_val = 0
        insider_val = 0

    # ----- PATRONES LARGOS -----

    # Gap and Go
    if (direction == 'up' and 
        gap_pct >= 15 and 
        gap_pct <= 50 and  # Sin sobre extensión excesiva
        float_val < 30_000_000 and 
        high_spike > 5 and
        high_volume and
        high_price > pm_high * 1.02):  # Breakout del PM high
        patrones.append("Gap and Go")

    # Gap and Crap Reversal
    if (direction == 'up' and 
        gap_pct >= 15 and 
        float_val <= 15_000_000 and 
        low_spike < -5 and  # Se pone roja
        below_vwap and  # Por debajo de VWAP
        high_volume and  # Volumen alto
        extension_from_prev_close >= 30):  # Extensión desde close anterior
        patrones.append("Gap and Crap Reversal")

    # ----- PATRONES CORTOS -----

    # Gap and Crap
    if (direction == 'up' and 
        gap_pct >= 10 and 
        low_spike < -5 and  # Se pone roja
        float_val <= 50_000_000 and
        is_overextended):  # Sobre extendida
        patrones.append("Gap and Crap")

    # Gap and Extensión
    if (direction == 'up' and 
        is_overextended and  # Sobre extensión en premarket
        high_price < pm_high * 0.98):  # Rechazo del PM high
        patrones.append("Gap and Extensión")

    # Over Extended Gap Down
    if (direction == 'down' and 
        gap_pct >= 10 and 
        is_overextended and  # Sobre extensión previa
        high_spike > 0 and high_spike < 10 and  # Bounce hacia el cierre
        volume < prev_volume):  # Menos volumen que el día anterior
        patrones.append("Over Extended Gap Down")

    # Short Into Resistance
    if (direction == 'up' and 
        gap_pct >= 50 and 
        bearish_trend and  # Tendencia bajista previa
        has_resistance_above and  # Resistencia significativa por encima
        high_price > resistance_level * 0.9):  # Acercándose a la resistencia
        patrones.append("Short Into Resistance")

    return patrones if patrones else []



# Endpoint principal para datos del mercado
@app.route('/get_stock_data', methods=['POST'])
def get_stock_data():
    data = request.get_json()
    ticker = data['ticker'].upper()
    period = data.get('period', 'max')
    min_gap = float(data.get('min_gap_percent', 20))
    min_volume = float(data.get('min_volume', 1000000))
    use_extended = data.get('use_extended', False)

    try:
        stock = yf.Ticker(ticker)
        info = stock.info
        
        # Forzar descarga de máximo histórico
        if period == 'max':
            try:
                df = stock.history(period="max", prepost=True)
                # Verificación adicional para datos antiguos
                if len(df) < 100:  # Si hay pocos datos, forzar rango amplio
                    df = stock.history(start="1980-01-01", prepost=True)
            except Exception as e:
                print(f"Error descargando histórico completo: {str(e)}")
                df = stock.history(start="1980-01-01")
        else:
            df = stock.history(period=period)
        
        if df.empty:
            return jsonify({'error': 'No se encontraron datos para este ticker'}), 404

        # Limpieza de datos
        df = df[df['Volume'] > 0].copy()
        df.dropna(subset=['Open', 'Close', 'High', 'Low'], inplace=True)

        # Verificación de datos descargados
        print(f"\nDatos descargados para {ticker}:")
        print(f"Rango temporal: {df.index.min()} a {df.index.max()}")
        print(f"Total de días: {len(df)}")

        extended_close = get_extended_hours_data(ticker) if use_extended else None
        
        # Cálculo de gaps
        df['Prev Close'] = df['Close'].shift(1)
        if use_extended and extended_close is not None and not df.empty:
            df.at[df.index[-1], 'Prev Close'] = extended_close
        
        df['Gap'] = (df['Open'] - df['Prev Close']) / df['Prev Close'] * 100

        # Volumen en dólares usando el Cierre Previo
        # df['DollarVolume'] = df['Volume'] * df['Prev Close']

        # Cálculo del volumen en dólares usando el precio de apertura
        df['DollarVolume'] = df['Volume'] * df['Open']

        df['Gap Direction'] = df['Gap'].apply(
            lambda x: 'up' if x > 0 else ('down' if x < 0 else None)
        )

        # Filtrado de gaps significativos
        significant_gaps = df[
            (abs(df['Gap']) >= min_gap) &
            (df['DollarVolume'] >= min_volume) &
            (df['Gap Direction'] == 'up') &  # <<< Aquí filtras solo los gaps "up"
            df['Gap'].notna() &
            df['Prev Close'].notna()
        ].copy()

        print(f"\nGaps encontrados ({len(significant_gaps)}):")
        print(significant_gaps[['Open', 'Prev Close', 'Gap', 'Volume']].tail())

        # Preparación de respuesta
        gaps_data = [{
            'date': idx.strftime('%Y-%m-%d'),
            'gap_percent': round(row['Gap'], 2),
            'direction': row['Gap Direction'],
            'open': round(row['Open'], 2),              # <<< Open del día del gap
            'prev_close': round(row['Prev Close'], 2),
            'close': round(row['Close'], 2),            # <<< Close del día del gap
            'volume': int(row['Volume']),
            'dollar_volume': round(row['DollarVolume'], 2),
            'high': round(row['High'], 2),
            'low': round(row['Low'], 2),
            'change_percent': round((row['Close'] - row['Prev Close']) / row['Prev Close'] * 100, 2)
            } for idx, row in significant_gaps.iterrows()]

        # Cálculo del día siguiente a cada gap (Day 2)
        day2_data = []
        for idx, row in significant_gaps.iterrows():
            next_idx = df.index.get_loc(idx) + 1
            if next_idx < len(df):
                next_row = df.iloc[next_idx]
                day2_data.append({
                    'date': next_row.name.strftime('%Y-%m-%d'),
                    'open': round(next_row['Open'], 2),          # <<< Open del Day 2
                    'close': round(next_row['Close'], 2),        # <<< Close del Day 2
                    'high': round(next_row['High'], 2),
                    'low': round(next_row['Low'], 2),
                    'volume': int(next_row['Volume']),
                    'dollar_volume': round(next_row['Volume'] * next_row['Open'], 2),
                    'gap_direction': row['Gap Direction'],
                    'gap_date': idx.strftime('%Y-%m-%d'),
                    'gap_size': round((next_row['Open'] - row['Close']) / row['Close'] * 100, 2),
                    'high_spike': round((next_row['High'] - next_row['Open']) / next_row['Open'] * 100, 2),
                    'low_spike': round((next_row['Low'] - next_row['Open']) / next_row['Open'] * 100, 2),
                    'prev_close': round(row['Close'], 2),
                    'return': round((next_row['Close'] - next_row['Open']) / next_row['Open'] * 100, 2),
                    'change': round((next_row['Close'] - row['Close']) / row['Close'] * 100, 2)
                })


        # Ordenar por fecha descendente
        gaps_data.sort(key=lambda x: x['date'], reverse=True)
        day2_data.sort(key=lambda x: x['date'], reverse=True)

        company_info = {
            'name': info.get('longName', ticker),
            'sector': info.get('sector', 'N/A'),
            'country': info.get('country', 'N/A'),           # <<< Añadido país
            'description': info.get('longBusinessSummary', 'N/A'),  # <<< Añadida descripción
            'marketCap': "${:,.2f}".format(info.get('marketCap', 0)) if info.get('marketCap') else 'N/A',
            'avgVolume': "{:,.0f}".format(info.get('averageVolume', 0)) if info.get('averageVolume') else 'N/A',
            'currentPrice': info.get('currentPrice', 'N/A'),
            'flow': calculate_money_flow(df),
            'floatShares': "{:,.0f}".format(info.get('floatShares', 0)) if info.get('floatShares') else 'N/A',
            'insiderOwn': "{:.2f}%".format(info.get('heldPercentInsiders', 0) * 100) if info.get('heldPercentInsiders') else 'N/A',
            'institutionalOwn': "{:.2f}%".format(info.get('heldPercentInstitutions', 0) * 100) if info.get('heldPercentInstitutions') else 'N/A',
            'shortInterest': "{:.2f}%".format(info.get('shortPercentOfFloat', 0) * 100) if info.get('shortPercentOfFloat') else 'N/A',
            'sharesOutstanding': "{:,.0f}".format(info.get('sharesOutstanding', 0)) if info.get('sharesOutstanding') else 'N/A',
        }

        # Detectar patrón del gap más reciente si existe
        if gaps_data:
            patrones_detectados = detectar_patron_gap(gaps_data[0], company_info)
        else:
            patrones_detectados = []

        # Si no hay ningún patrón, mostramos mensaje personalizado
        playbooks_result = patrones_detectados if patrones_detectados else ["Ningún patrón identificado"]


        # Construir la respuesta completa
        return jsonify({
            'dates': df.index.strftime('%Y-%m-%d').tolist(),
            'prices': {
                'open': df['Open'].round(2).tolist(),
                'high': df['High'].round(2).tolist(),
                'low': df['Low'].round(2).tolist(),
                'close': df['Close'].round(2).tolist()
            },
            'volume': df['Volume'].astype(int).tolist(),
            'gaps': gaps_data,
            'day2': day2_data,
            'company': company_info,
            'gap_stats': calculate_gap_stats(df, significant_gaps),
            'extended_used': use_extended and extended_close is not None,
            'playbooks': playbooks_result,  # Ahora es una lista vacía o con varios strings
            'data_range': {
                'start_date': df.index.min().strftime('%Y-%m-%d'),
                'end_date': df.index.max().strftime('%Y-%m-%d')
            }
        })



    except Exception as e:
        app.logger.error(f"Error procesando {ticker}: {traceback.format_exc()}")
        return jsonify({
            'error': 'Error al procesar los datos',
            'details': str(e),
            'traceback': traceback.format_exc()  # Solo para desarrollo, quitar en producción
        }), 500

@app.route('/status')
@check_active_session
@admin_required
def status():
    return jsonify({
        'status': 'ok',
        'app': 'Gap Detector',
        'env_secret_loaded': bool(os.getenv('SECRET_KEY')),
        'mail_configured': bool(os.getenv('MAIL_USERNAME')) and bool(os.getenv('MAIL_PASSWORD')),
        'environment': 'production' if not app.debug else 'development',
        'session_active': 'user_id' in session
    })


if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True)