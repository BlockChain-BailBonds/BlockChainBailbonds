package dev.m3rma1d.s1r3n

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { CompanionStatus() }
    }
}

@Composable
private fun CompanionStatus() {
    MaterialTheme {
        Surface {
            Column(modifier = Modifier.padding(24.dp)) {
                Text("M3rMa1d S1r3n", style = MaterialTheme.typography.headlineMedium)
                Text("Bridge stopped", style = MaterialTheme.typography.bodyLarge)
            }
        }
    }
}
